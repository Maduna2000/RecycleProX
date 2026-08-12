// SCRATCH-DIAGNOSTIC ONLY — read-only. Investigates the "stock taken as loan
// repayment gets counted as cash in cashup" theory: applyRepaymentTx()
// (src/lib/services/loanService.ts) hardcodes paymentMethod: 'cash' on every
// LoanRepayment it creates from a purchase's loan deduction, even though no
// physical cash moved. getLoanTotalsForDate() then trusts that column at
// face value, which can inflate a day's cashExpected.
//
// Imports the REAL app modules (prisma, withTenantId, registryPrisma) — not
// a reimplementation — so this reflects the actual production code paths.
// Only ever calls .findMany / .findFirst / .aggregate. No .create, .update,
// .delete, or $executeRaw anywhere in this file.
//
// Usage:
//   DATABASE_URL="..." npx tsx scripts/scratch-check-loan-cashup.ts "wetive"
//
// The name argument is a case-insensitive substring matched against each
// tenant's Customer.companyName / firstName / lastName. Omit it to scan
// every tenant for ANY purchase-linked loan repayment (useful to see how
// widespread this is beyond the one customer that was reported).
import 'dotenv/config'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { withTenantId } from '@/lib/db/tenantContext'
import { sastDayLabelOfInstant, sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'

const searchTerm = process.argv[2] ?? ''

function money(d: Decimal | string | null | undefined): string {
  return new Decimal(d?.toString() ?? '0').toFixed(2)
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenants = await (registryPrisma as any).tenant.findMany({
    where: { status: 'active' },
    select: { id: true, companyName: true, companySlug: true },
  })
  console.log(`Scanning ${tenants.length} active tenant(s)${searchTerm ? ` for customer name matching "${searchTerm}"` : ' for ANY purchase-linked loan repayment'}...\n`)

  let totalFlaggedRealInflation = new Decimal(0)
  let matchCount = 0

  for (const tenant of tenants) {
    await withTenantId(tenant.id, async () => {
      const customers = searchTerm
        ? await prisma.customer.findMany({
            where: {
              OR: [
                { companyName: { contains: searchTerm, mode: 'insensitive' } },
                { firstName: { contains: searchTerm, mode: 'insensitive' } },
                { lastName: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
            select: { id: true, companyName: true, firstName: true, lastName: true },
          })
        : []

      // With no search term, pull every purchase-linked repayment tenant-wide
      // instead of customer-first.
      const customerIds = searchTerm ? customers.map((c) => c.id) : undefined
      if (searchTerm && customers.length === 0) return

      const repayments = await prisma.loanRepayment.findMany({
        where: {
          purchaseId: { not: null },
          ...(customerIds ? { customerId: { in: customerIds } } : {}),
        },
        include: {
          customer: { select: { companyName: true, firstName: true, lastName: true } },
          loan: { select: { refNumber: true, status: true } },
          purchase: {
            select: {
              id: true, refNumber: true, status: true, paymentMethod: true,
              totalAmount: true, loanDeductionAmount: true, amountPaid: true,
              createdAt: true, payments: { select: { id: true, amount: true, paymentMethod: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (repayments.length === 0) return

      console.log(`\n=== Tenant: ${tenant.companyName} (${tenant.companySlug}) ===`)

      for (const r of repayments) {
        matchCount++
        const custName = r.customer.companyName || `${r.customer.firstName} ${r.customer.lastName}`
        const amount = new Decimal(r.amount.toString())
        const isReversal = amount.isNegative()
        const purchase = r.purchase

        console.log(`\n  LoanRepayment ${r.refNumber} — customer: ${custName} — loan ${r.loan.refNumber} (${r.loan.status})`)
        console.log(`    amount: R ${money(amount)}  storedPaymentMethod: ${r.paymentMethod}${isReversal ? '  [REVERSAL entry]' : ''}`)
        console.log(`    createdAt: ${r.createdAt.toISOString()}`)

        if (!purchase) {
          console.log(`    ⚠ purchase not found (may have been deleted) — cannot classify`)
          continue
        }

        const hasPaymentRows = purchase.payments.length > 0
        const purchaseIsCash = purchase.paymentMethod === 'cash'
        const purchaseCompletedNoPayments = purchase.status === 'completed' && !hasPaymentRows

        console.log(`    purchase ${purchase.refNumber}: status=${purchase.status} paymentMethod=${purchase.paymentMethod} totalAmount=R ${money(purchase.totalAmount)} loanDeductionAmount=R ${money(purchase.loanDeductionAmount)} amountPaid=R ${money(purchase.amountPaid)} linkedPaymentRows=${purchase.payments.length}`)

        // Classification per the root-cause analysis:
        // - purchase settled via markPurchasePaid/processSplitPayment (has
        //   linked Payment row(s)) -> cashPurchases already correctly
        //   excludes the loan-deducted slice via the Payment-row path, so
        //   the +loansTotal addition for this repayment is pure inflation.
        // - purchase created directly 'completed', cash, with NO linked
        //   Payment rows -> calcSystemTotals' cashPurchases query sums raw
        //   totalAmount (not amountPaid) for this purchase, over-subtracting
        //   by the same amount this repayment over-adds — coincidentally
        //   nets to zero.
        // - purchase's own paymentMethod isn't 'cash' and has no linked
        //   Payment rows -> excluded from cashPurchases entirely, so again
        //   nothing offsets the +loansTotal addition -> pure inflation.
        let verdict: string
        if (isReversal) {
          verdict = 'reversal entry — nets against its original repayment, skip'
        } else if (hasPaymentRows) {
          verdict = '🔴 REAL INFLATION — purchase settled via split/mark-paid; cashPurchases already excludes the loan slice, loansTotal adds it back with nothing to offset it'
          totalFlaggedRealInflation = totalFlaggedRealInflation.plus(amount)
        } else if (purchaseCompletedNoPayments && purchaseIsCash) {
          verdict = '🟡 likely coincidentally offsetting — purchase created directly as completed/cash, cashPurchases over-subtracts totalAmount which happens to cancel this addition (verify against that day\'s CashUp below)'
        } else {
          verdict = '🔴 REAL INFLATION — purchase paymentMethod is not cash and has no linked Payment row, so nothing in cashPurchases offsets this'
          totalFlaggedRealInflation = totalFlaggedRealInflation.plus(amount)
        }
        console.log(`    verdict: ${verdict}`)

        // Look up the CashUp session covering the day this purchase happened.
        const dayLabel = sastDayLabelOfInstant(purchase.createdAt)
        const sessionDate = sastDateLabelToUTCDate(dayLabel)
        const cashUps = await prisma.cashUp.findMany({
          where: { sessionDate },
          select: {
            id: true, status: true, loansTotal: true, systemCashExpected: true,
            declaredCash: true, variance: true, openedAt: true,
          },
        })
        if (cashUps.length === 0) {
          console.log(`    (no CashUp session recorded for ${dayLabel} yet)`)
        } else {
          for (const cu of cashUps) {
            console.log(`    CashUp ${dayLabel} [${cu.status}]: loansTotal=R ${money(cu.loansTotal)} systemCashExpected=R ${money(cu.systemCashExpected)} declaredCash=R ${money(cu.declaredCash)} variance=R ${money(cu.variance)}`)
          }
        }
      }
    })
  }

  console.log(`\n\n──────────────────────────────────────────────`)
  console.log(`Matched ${matchCount} purchase-linked loan repayment(s) across ${tenants.length} tenant(s).`)
  console.log(`Total flagged as REAL cashExpected inflation: R ${totalFlaggedRealInflation.toFixed(2)}`)
  console.log(`(🟡 entries are NOT included in that total — check their CashUp line above to confirm they actually netted to zero, don't assume it.)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await registryPrisma.$disconnect()
  })
