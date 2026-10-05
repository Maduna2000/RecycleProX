// ONE-OFF: enters invoice EX001D/2026 (Suhag Investrades, 03/10/2026) as a single
// PENDING (unpaid, on-account) sale via the real createSale service, so stock,
// ledger and audit all behave exactly as if it was keyed in the UI.
//
// Dry run (default — prints what it matched, writes nothing):
//   npx tsx scripts/oneoff-suhag-invoice-ex001d.ts
// Real run:
//   npx tsx scripts/oneoff-suhag-invoice-ex001d.ts --commit
//
// Needs DATABASE_URL (and the registry DB env) of the target database.
// Do NOT run twice with --commit: it refuses if a sale noting this invoice exists.
import 'dotenv/config'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { withTenantId } from '@/lib/db/tenantContext'
import { createSale } from '@/lib/services/saleService'
import { CreateSaleSchema } from '@/lib/schemas/sale'

const INVOICE_NO = 'EX001D/2026'
const CUSTOMER_SEARCH = 'Suhag'

// [product name, weight kg, price per kg] — amounts are computed by createSale
// with Decimal.js; the invoice's own line amounts all match weight x price.
const LINES: Array<[string, string, string]> = [
  ['Aluminum Cans',      '97.5',   '27'],
  ['Aluminum Wire',      '581.5',  '46'],
  ['Aluminum Radiator',  '420.5',  '26'],
  ['Aluminum Extrusion', '339.5',  '46'],
  ['Aluminum Rims',      '645',    '43'],
  ['Aluminum Cast',      '2665.5', '37'],
  ['Aluminum O/R',       '1177.5', '35'],
  ['Stainless Steel 304', '165',   '18'],
  ['Litho Sheets',       '324',    '48'],
  ['Lead',               '144.5',  '25'],
  ['Stainless Steel 201', '1.5',   '5'],
]

async function main() {
  const commit = process.argv.includes('--commit')
  const tenant = await registryPrisma.tenant.findUnique({ where: { schemaName: 'public' } })
  if (!tenant) throw new Error('No Tenant row found for schemaName "public"')

  await withTenantId(tenant.id, async () => {
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { companyName: { contains: CUSTOMER_SEARCH, mode: 'insensitive' } },
          { firstName:   { contains: CUSTOMER_SEARCH, mode: 'insensitive' } },
          { lastName:    { contains: CUSTOMER_SEARCH, mode: 'insensitive' } },
        ],
      },
    })
    if (customers.length !== 1) {
      throw new Error(`Expected exactly 1 customer matching "${CUSTOMER_SEARCH}", found ${customers.length}: ` +
        customers.map((c) => `${c.companyName ?? `${c.firstName} ${c.lastName}`} (${c.id})`).join('; '))
    }
    const customer = customers[0]
    const buyerName = (customer.companyName ?? `${customer.firstName} ${customer.lastName}`).slice(0, 100)
    console.log(`Customer: ${buyerName} (${customer.id})`)

    const lines = []
    for (const [name, qty, price] of LINES) {
      const matches = await prisma.product.findMany({ where: { name: { equals: name, mode: 'insensitive' } } })
      if (matches.length !== 1) throw new Error(`Expected exactly 1 product named "${name}", found ${matches.length}`)
      console.log(`  ${name.padEnd(20)} ${qty.padStart(7)} kg x E${price}  -> ${matches[0].code}`)
      lines.push({ productId: matches[0].id, quantity: qty, unitPrice: price })
    }

    const input = CreateSaleSchema.parse({
      customerId: customer.id,
      buyerName,
      paymentMethod: 'eft',
      status: 'pending',
      applyVat: false,
      notes: `Invoice ${INVOICE_NO} dated 03/10/2026`,
      lines,
    })

    const existing = await prisma.sale.findFirst({ where: { notes: { contains: INVOICE_NO } } })
    if (existing) throw new Error(`Sale ${existing.refNumber} already notes invoice ${INVOICE_NO} — refusing to duplicate`)

    if (!commit) {
      console.log('\nDRY RUN — nothing written. Re-run with --commit to create the sale.')
      return
    }
    const sale = await createSale(input)
    console.log(`\nCreated pending sale ${sale.refNumber}, total E${sale.totalAmount.toString()}`)
  })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
