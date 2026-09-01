/**
 * PRODUCTION — one-time backfill of ProductAverageCost.quantityOnHand.
 * See docs/plans/2026-09-01-ledger-phase-1-3-implementation-plan.md, Phase 2.
 *
 * Why this is needed: before this backfill, a product whose ONLY historical
 * stock activity was a manual adjustment (Stock module's "Adjust Stock"
 * action, prior to the ledger-posting fix landing) has real StockMovement
 * rows but no ProductAverageCost row at all — that row is only ever created
 * lazily, on first purchase/sale/stocktake-adjustment. Any report that reads
 * on-hand quantity from ProductAverageCost instead of the StockMovement
 * ledger (e.g. ledgerReportService.getStockValueByCategory, once switched
 * over) would silently show that product's stock as zero.
 *
 * What this does: for every Product, computes true on-hand quantity from
 * getStockOnHand() (the StockMovement ledger — already correctly excludes
 * voided purchase/sale pairs) and upserts ProductAverageCost.quantityOnHand
 * to match, wherever it's missing or different. averageCost is left
 * untouched on an existing row (recomputing historical average cost would
 * require replaying every purchase in order and isn't needed — only
 * quantity tracking had the gap); a newly-created row gets averageCost 0,
 * matching the "no purchase history" fallback ledgerService itself already
 * uses (see postStocktakeAdjustment's avgCost fallback).
 *
 * Idempotent: safe to re-run — only writes rows whose quantity is actually
 * out of sync.
 *
 * Run:
 *   npx tsx scripts/backfill-product-average-cost-quantities.ts             (dry run — default, no writes)
 *   npx tsx scripts/backfill-product-average-cost-quantities.ts --execute   (actually writes)
 */
import 'dotenv/config'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { withTenantId } from '@/lib/db/tenantContext'
import { getStockOnHand } from '@/lib/services/stockService'

const EXECUTE = process.argv.includes('--execute')

async function main() {
  const tenant = await registryPrisma.tenant.findUnique({ where: { schemaName: 'public' } })
  if (!tenant) throw new Error('Default tenant (schemaName "public") not found in registry')

  await withTenantId(tenant.id, async () => {
    const [rows, existingCosts] = await Promise.all([
      getStockOnHand(),
      prisma.productAverageCost.findMany(),
    ])
    const existingByProduct = new Map(existingCosts.map((c) => [c.productId, c]))

    let matched = 0
    let toCreate = 0
    let toUpdate = 0

    for (const row of rows) {
      const trueOnHand = new Decimal(row.onHand)
      const existing = existingByProduct.get(row.product.id)

      if (!existing) {
        if (trueOnHand.isZero()) { matched++; continue } // nothing to correct — no row needed for zero stock
        toCreate++
        console.log(`CREATE  ${row.product.name.padEnd(40)} qty=0 -> ${trueOnHand.toFixed(3)}  (averageCost=0.00, no purchase history)`)
        if (EXECUTE) {
          await prisma.productAverageCost.create({
            data: { tenantId: tenant.id, productId: row.product.id, quantityOnHand: trueOnHand, averageCost: new Decimal(0) },
          })
        }
        continue
      }

      const currentQty = new Decimal(existing.quantityOnHand.toString())
      if (currentQty.equals(trueOnHand)) { matched++; continue }

      toUpdate++
      console.log(`UPDATE  ${row.product.name.padEnd(40)} qty=${currentQty.toFixed(3)} -> ${trueOnHand.toFixed(3)}`)
      if (EXECUTE) {
        await prisma.productAverageCost.update({
          where: { productId: row.product.id },
          data: { quantityOnHand: trueOnHand },
        })
      }
    }

    console.log(`\n${EXECUTE ? 'Applied' : 'Would apply'}: ${toCreate} create, ${toUpdate} update, ${matched} already in sync.`)
    if (!EXECUTE) console.log('Dry run — re-run with --execute to write.')
  })
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await Promise.allSettled([prisma.$disconnect(), registryPrisma.$disconnect()]) })
