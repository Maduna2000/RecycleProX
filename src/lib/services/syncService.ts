import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { tenantContext } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

// Desktop's sync routes authenticate via device token (see
// deviceAuthClient.ts), not a Web session, so they only ever have
// schemaName/companySlug on hand (from the Portal's device-license check),
// never a tenantId directly. Resolved here rather than changing every
// caller's signature.
async function resolveTenantId(schemaName: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (registryPrisma as any).tenant.findUniqueOrThrow({ where: { schemaName } })
  return tenant.id
}

// Models a Desktop install may push/pull. Deliberately an explicit
// allowlist, not "any model" — a table with a foreign-key shape sync
// doesn't understand yet (or one that shouldn't sync at all) fails loudly
// via "not syncable" rather than silently corrupting data. User is included
// per the plan's "special-case handling" note — see the SaaS plan section
// C.4, flagged there as needing a focused design pass this allowlist alone
// doesn't fully resolve (local PIN/password changes still need to push up,
// but provisioning-time seed data should pull down cleanly).
const SYNCABLE_MODELS = new Set([
  'Customer', 'Product', 'ProductCategory', 'Purchase', 'PurchaseLine',
  'Sale', 'SaleLine', 'Payment', 'StockMovement', 'CashUp', 'CashFloat',
  'FloatMovement', 'Expense', 'PriceGroup', 'PriceGroupProductOverride',
  'Stocktake', 'StocktakeEntry', 'ScaleOrder', 'ScaleOrderLine', 'User',
])

export interface SyncPushRecord {
  tableName: string
  recordId: string
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
}

export type SyncPushResultStatus = 'applied' | 'skipped' | 'rejected' | 'error'

function modelDelegate(tableName: string) {
  const key = tableName.charAt(0).toLowerCase() + tableName.slice(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any)[key]
}

// Conflict rule: last-write-wins by updatedAt, applied per record. A
// deliberate simplification (documented in the plan) appropriate to this
// domain — one operational system of record active at a time, and
// mutations are narrow (void, mark-paid, status change) rather than
// requiring full CRDT-style merge.
export async function applySyncPush(
  schemaName: string,
  companySlug: string,
  records: SyncPushRecord[],
): Promise<Array<{ recordId: string; status: SyncPushResultStatus; reason?: string }>> {
  const tenantId = await resolveTenantId(schemaName)
  return tenantContext.run({ tenantId, schemaName, companySlug }, async () => {
    const results: Array<{ recordId: string; status: SyncPushResultStatus; reason?: string }> = []

    for (const record of records) {
      if (!SYNCABLE_MODELS.has(record.tableName)) {
        results.push({ recordId: record.recordId, status: 'rejected', reason: 'not syncable' })
        continue
      }

      const delegate = modelDelegate(record.tableName)

      try {
        if (record.operation === 'delete') {
          await delegate.deleteMany({ where: { id: record.recordId } })
          results.push({ recordId: record.recordId, status: 'applied' })
          continue
        }

        const existing = await delegate.findUnique({ where: { id: record.recordId } })
        const incomingUpdatedAt = record.payload.updatedAt
          ? new Date(record.payload.updatedAt as string)
          : new Date()

        if (existing?.updatedAt && new Date(existing.updatedAt) > incomingUpdatedAt) {
          results.push({ recordId: record.recordId, status: 'skipped', reason: 'server copy is newer' })
          continue
        }

        await delegate.upsert({
          where: { id: record.recordId },
          create: { ...record.payload, id: record.recordId },
          update: record.payload,
        })
        results.push({ recordId: record.recordId, status: 'applied' })
      } catch (err) {
        logger.error({ err, tableName: record.tableName, recordId: record.recordId }, 'Sync push record failed')
        results.push({ recordId: record.recordId, status: 'error' })
      }
    }

    return results
  })
}

export async function pullChanges(
  schemaName: string,
  companySlug: string,
  tableName: string,
  since: Date,
) {
  if (!SYNCABLE_MODELS.has(tableName)) {
    throw new Error(`Table not syncable: ${tableName}`)
  }

  const tenantId = await resolveTenantId(schemaName)
  return tenantContext.run({ tenantId, schemaName, companySlug }, async () => {
    const delegate = modelDelegate(tableName)
    return delegate.findMany({
      where: { updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
      take: 500,
    })
  })
}
