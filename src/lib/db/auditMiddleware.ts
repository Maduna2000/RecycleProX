import type { PrismaClient } from '@prisma/client'
import logger from '@/lib/logger'
import { encodeJsonField } from '@/lib/db/queryHelpers'

const WRITE_MODELS = [
  'User', 'Purchase', 'PurchaseLine', 'Sale', 'SaleLine',
  'Customer', 'Payment', 'Expense', 'CashUp', 'CashFloat',
  'StockMovement', 'Product', 'PriceGroup', 'PriceGroupProductOverride',
  'Stocktake', 'StocktakeEntry', 'ScaleOrder',
]
const WRITE_ACTIONS = ['create', 'update', 'delete']

// Intercepts writes on all business models and records them to AuditLog.
// Shared by every Prisma client this app creates (the default/public-schema
// client and every per-tenant schema client) so audit coverage is uniform
// regardless of which schema a request resolves to.
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

      setImmediate(async () => {
        try {
          await client.auditLog.create({
            data: {
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
      })

      return result
    }

    return next(params)
  })

  return client
}
