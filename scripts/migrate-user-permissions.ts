/**
 * Migration Script: Grant full module access to existing users
 *
 * This script grants full access to all modules for existing manager and cashier users.
 * Admin and scale_operator users don't need module access records:
 * - Admins bypass all permission checks
 * - Scale operators can't access the main app
 *
 * Run this script after the Prisma migration that adds the UserModuleAccess table:
 *   npx ts-node scripts/migrate-user-permissions.ts
 *
 * Or via npm script:
 *   npm run migrate:permissions
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ALL_MODULES = [
  '/app/dashboard',
  '/app/customers',
  '/app/purchases',
  '/app/sales',
  '/app/payments',
  '/app/expenses',
  '/app/cashup',
  '/app/float',
  '/app/stock',
  '/app/stocktake',
  '/app/products',
  '/app/price-groups',
  '/app/reports',
  '/app/loans',
  '/app/police-register',
  '/app/audit-log',
  '/app/settings',
]

async function main() {
  console.log('Starting user permissions migration...\n')

  // Find all manager and cashier users
  const users = await prisma.user.findMany({
    where: {
      role: { in: ['manager', 'cashier'] },
    },
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      moduleAccess: { select: { moduleKey: true } },
    },
  })

  console.log(`Found ${users.length} manager/cashier users to migrate\n`)

  let migratedCount = 0
  let skippedCount = 0

  for (const user of users) {
    // Skip users who already have module access records
    if (user.moduleAccess.length > 0) {
      console.log(`  SKIP: ${user.username} (${user.role}) - already has ${user.moduleAccess.length} module(s)`)
      skippedCount++
      continue
    }

    // Grant full access to all modules
    await prisma.userModuleAccess.createMany({
      data: ALL_MODULES.map((moduleKey) => ({
        userId: user.id,
        moduleKey,
        grantedById: null, // System migration
      })),
      skipDuplicates: true,
    })

    console.log(`  OK: ${user.username} (${user.role}) - granted ${ALL_MODULES.length} modules`)
    migratedCount++
  }

  console.log('\n--- Migration Summary ---')
  console.log(`  Migrated: ${migratedCount} users`)
  console.log(`  Skipped:  ${skippedCount} users (already had permissions)`)
  console.log(`  Total:    ${users.length} users processed`)
  console.log('\nMigration complete!')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
