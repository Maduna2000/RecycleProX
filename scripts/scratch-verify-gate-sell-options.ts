// SCRATCH — one-time verification after the gate_sell_options migration:
// confirms RLS is enabled+forced with a tenant_isolation policy on the new
// GateSellOption table, and that the categoryName -> categoryNames backfill
// preserved the 3 non-null rows Prisma warned about pre-migration.
// Run: DATABASE_URL=<direct, non-pooler> npx tsx scripts/scratch-verify-gate-sell-options.ts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const rls = await db.$queryRawUnsafe(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'GateSellOption'`,
  )
  console.log('GateSellOption RLS flags:', rls)

  const policies = await db.$queryRawUnsafe(
    `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'GateSellOption'`,
  )
  console.log('GateSellOption policies:', policies)

  const backfilled = await db.$queryRawUnsafe(
    `SELECT "entryNumber", "categoryNames" FROM "GateEntry" WHERE array_length("categoryNames", 1) > 0`,
  )
  console.log('Backfilled categoryNames rows:', backfilled)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
