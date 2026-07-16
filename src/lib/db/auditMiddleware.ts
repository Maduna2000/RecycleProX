import type { PrismaClient } from '@prisma/client'
import logger from '@/lib/logger'
import { encodeJsonField } from '@/lib/db/queryHelpers'
import { activeTenantTx, requireTenantId } from '@/lib/db/tenantContext'

const WRITE_MODELS = [
  'User', 'Purchase', 'PurchaseLine', 'Sale', 'SaleLine',
  'Customer', 'Payment', 'Expense', 'CashUp', 'CashFloat',
  'StockMovement', 'Product', 'PriceGroup', 'PriceGroupProductOverride',
  'Stocktake', 'StocktakeEntry', 'ScaleOrder',
]
const WRITE_ACTIONS = ['create', 'update', 'delete']

// Intercepts writes on all business models and records them to AuditLog.
export function attachAuditMiddleware<T extends PrismaClient>(client: T): T {
  client.$use(async (params, next) => {
    if (WRITE_MODELS.includes(params.model ?? '') && WRITE_ACTIONS.includes(params.action)) {
      let oldValues: Record<string, unknown> | null = null

      if (params.action === 'update' && params.args.where) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          oldValues = await (client as any)[params.model!.charAt(0).toLowerCase() + params.model!.slice(1)].findUnique({
            where: params.args.where,
          })
        } catch {
          // best-effort
        }
      }

      const result = await next(params)

      const actionMap: Record<string, string> = {
        create: 'INSERT',
        update: 'UPDATE',
        delete: 'DELETE',
      }

      // Extract changedById from the data args — covers createdByUserId, voidedById,
      // voidedByUserId (Stocktake's naming), approvedById, closedByUserId patterns
      // used across all service functions.
      const dataArgs = (params.args?.data ?? {}) as Record<string, unknown>
      const changedById =
        (dataArgs.createdByUserId as string | undefined) ??
        (dataArgs.voidedById as string | undefined) ??
        (dataArgs.voidedByUserId as string | undefined) ??
        (dataArgs.approvedById as string | undefined) ??
        (dataArgs.closedByUserId as string | undefined) ??
        (dataArgs.openedByUserId as string | undefined) ??
        null

      // Written synchronously, inside the same transaction as the triggering
      // operation — NOT deferred via setImmediate. Under RLS, the tenant pin
      // (set_config('app.current_tenant_id', ...)) is scoped to the current
      // transaction only (SET LOCAL semantics — see src/lib/db/prisma.ts). A
      // deferred write fires after that transaction has already committed,
      // on a connection with no tenant pinned, which would violate
      // AuditLog's RLS policy (or insert with a NULL tenantId). Resolving
      // the active tenant-scoped tx here (if any — see activeTenantTx in
      // tenantContext.ts) keeps the audit row on the same connection/pin as
      // the write it's recording.
      try {
        const target = activeTenantTx.getStore() ?? client
        await target.auditLog.create({
          data: {
            tenantId: requireTenantId(),
            tableName: params.model ?? 'unknown',
            recordId: result?.id ? String(result.id) : 'unknown',
            action: actionMap[params.action] as never,
            oldValues: oldValues ? encodeJsonField(oldValues) : undefined,
            newValues: result ? encodeJsonField(result) : undefined,
            changedById,
            rowHash: '',
          },
        })
      } catch (err) {
        logger.error({ err }, 'Audit log write failed')
      }

      return result
    }

    return next(params)
  })

  return client
}
