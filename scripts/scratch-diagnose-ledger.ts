// SCRATCH-DIAGNOSTIC ONLY — read-only. Compares ledger Cash against
// CashUp.declaredCash (the actually human-counted figure, set at session
// approval) rather than CashFloat, since CashFloat and CashUp appear to
// disagree with each other in the real data for the same dates. Imports
// the REAL app modules. Only ever calls .findMany / .aggregate. No
// .create, .update, .delete, or $executeRaw anywhere.
//
// Usage: npx tsx scripts/scratch-diagnose-ledger.ts
import 'dotenv/config'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { withTenantId } from '@/lib/db/tenantContext'

async function main() {
  const tenant = await registryPrisma.tenant.findUnique({ where: { schemaName: 'public' } })
  if (!tenant) throw new Error('No Tenant row found for schemaName "public"')

  await withTenantId(tenant.id, () => prisma.$transaction(async (tx) => {
    const cashAccount = await tx.account.findFirst({ where: { code: '1000' } })
    if (!cashAccount) { console.log('No Cash account found.'); return }

    const sessions = await tx.cashUp.findMany({
      where: { status: { in: ['approved', 'submitted'] } },
      orderBy: [{ sessionDate: 'asc' }, { openedAt: 'asc' }],
    })
    console.log(`All approved/submitted CashUp sessions: ${sessions.length}\n`)
    console.log('Session window vs ledger Cash movement within that exact window\n')
    for (const s of sessions) {
      const closeTime = s.closedAt ?? s.approvedAt ?? s.updatedAt
      const sums = await tx.journalLine.aggregate({
        where: { accountId: cashAccount.id, journalEntry: { entryDate: { gte: s.openedAt, lte: closeTime } } },
        _sum: { debit: true, credit: true },
      })
      const debit = new Decimal(sums._sum.debit?.toString() ?? '0')
      const credit = new Decimal(sums._sum.credit?.toString() ?? '0')
      const ledgerDelta = debit.minus(credit)
      const opening = new Decimal(s.openingBalance.toString())
      const declared = s.declaredCash ? new Decimal(s.declaredCash.toString()) : null
      const realDelta = declared ? declared.minus(opening) : null
      const diff = realDelta ? ledgerDelta.minus(realDelta) : null
      console.log(
        `  ${s.sessionDate.toISOString().split('T')[0]} (${s.status}) opened ${s.openedAt.toISOString()} closed ${closeTime.toISOString()}` +
        `\n    real delta (declared-opening): ${realDelta ? realDelta.toFixed(2) : 'n/a'}  ledger delta: ${ledgerDelta.toFixed(2)}` +
        (diff ? `  DIFF: ${diff.toFixed(2)}` : '') +
        `  systemCashExpected: ${s.systemCashExpected}  variance: ${s.variance ?? 'null'}`
      )
    }
  }, { timeout: 60_000 }))
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await Promise.allSettled([prisma.$disconnect(), registryPrisma.$disconnect()]) })
