import type { PrismaClient } from '@prisma/client'
import logger from '@/lib/logger'
import { encodeJsonField } from '@/lib/db/queryHelpers'
import { activeTenantId, activeTenantTx, requireTenantId } from '@/lib/db/tenantContext'

const WRITE_MODELS = [
  'User', 'Purchase', 'PurchaseLine', 'Sale', 'SaleLine',
  'Customer', 'Payment', 'Expense', 'CashUp', 'CashFloat',
  'StockMovement', 'Product', 'PriceGroup', 'PriceGroupProductOverride',
  'Stocktake', 'StocktakeEntry', 'ScaleOrder',
  // Added in the production-readiness audit (2026-07-30) — these were all
  // silently unaudited despite being tenant-scoped, real-money or
  // security/compliance-relevant models (loans, gate visits, police
  // register, float, permissions, settings, documents).
  'Loan', 'LoanRepayment', 'BusinessLoan', 'BusinessLoanRepayment',
  'GateEntry', 'GatePurposeConfig', 'GateSellOption',
  'PoliceVisit', 'PoliceSearchLog',
  'FloatMovement', 'UserModuleAccess', 'SystemSettings',
  'CustomerDocument', 'ExpenseAttachment', 'ExpenseType', 'MediaFile',
  'TransactionPayment', 'TransactionPaymentLink',
  'PriceHistory', 'ProductCategory', 'CategoryStepConfig', 'ScaleOrderLine',
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
      // used across all service functions. operatorId/exitedById (GateEntry),
      // grantedById (UserModuleAccess), uploadedByUserId (CustomerDocument/
      // ExpenseAttachment/MediaFile), changedById (PriceHistory) and
      // launchedByUserId (PoliceVisit) added for the models brought into
      // WRITE_MODELS by the 2026-07-30 audit. Some newly-covered models
      // (GateSellOption, ProductCategory, ExpenseType, TransactionPaymentLink,
      // PoliceSearchLog, GatePurposeConfig, ScaleOrderLine, SystemSettings,
      // CategoryStepConfig) have no "who" column at all — changedById stays
      // null for those, which still records what/when, strictly better than
      // no audit row at all.
      const dataArgs = (params.args?.data ?? {}) as Record<string, unknown>
      const changedById =
        (dataArgs.createdByUserId as string | undefined) ??
        (dataArgs.voidedById as string | undefined) ??
        (dataArgs.voidedByUserId as string | undefined) ??
        (dataArgs.approvedById as string | undefined) ??
        (dataArgs.closedByUserId as string | undefined) ??
        (dataArgs.openedByUserId as string | undefined) ??
        (dataArgs.operatorId as string | undefined) ??
        (dataArgs.exitedById as string | undefined) ??
        (dataArgs.grantedById as string | undefined) ??
        (dataArgs.uploadedByUserId as string | undefined) ??
        (dataArgs.changedById as string | undefined) ??
        (dataArgs.launchedByUserId as string | undefined) ??
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
            // Prefer the tenantId the enclosing transaction was actually
            // pinned with (provably correct — it's the literal value used
            // in pinTenantContext's set_config call, see prisma.ts) over an
            // independent, redundant ambient requireTenantId() lookup. Falls
            // back defensively for any write path that somehow bypasses
            // withTenantScope (should not happen once all routes are
            // wrapped — see i-need-you-to-vectorized-pumpkin.md Section 12).
            tenantId: activeTenantId.getStore() ?? requireTenantId(),
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
