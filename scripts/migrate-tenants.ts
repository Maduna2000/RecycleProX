/**
 * Migration Script: Fan out pending Prisma migrations across every tenant schema
 *
 * Schema-per-tenant means a normal `prisma migrate deploy` (which only
 * targets the `public` schema) never touches tenant business-data schemas.
 * This script applies the current migration history to every schema listed
 * in the Tenant registry, one at a time. Must run outside any Vercel request
 * handler — unbounded time × unbounded tenant count is not safe there.
 *
 * Run manually:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-tenants.ts
 *
 * Or via the migrate-tenants.yml GitHub Actions workflow.
 */

import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'child_process'

const registryPrisma = new PrismaClient()

function buildTenantDatabaseUrl(schemaName: string): string {
  const base = process.env.DATABASE_URL
  if (!base) throw new Error('DATABASE_URL is not set')
  const url = new URL(base)
  url.searchParams.set('schema', schemaName)
  return url.toString()
}

async function main() {
  const tenants = await registryPrisma.tenant.findMany({
    where: { status: { in: ['active', 'provisioning'] } },
    select: { schemaName: true, companySlug: true },
  })

  if (tenants.length === 0) {
    console.log('No tenant schemas to migrate yet — nothing to do.')
    return
  }

  console.log(`Applying pending migrations to ${tenants.length} tenant schema(s)...`)

  const failures: string[] = []

  for (const tenant of tenants) {
    console.log(`\n→ ${tenant.companySlug} (${tenant.schemaName})`)
    try {
      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: buildTenantDatabaseUrl(tenant.schemaName) },
      })
    } catch (err) {
      console.error(`✗ Failed migrating ${tenant.schemaName}:`, err)
      failures.push(tenant.schemaName)
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} tenant schema(s) failed to migrate: ${failures.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log(`\nAll ${tenants.length} tenant schema(s) migrated successfully.`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => registryPrisma.$disconnect())
