import { PrismaClient } from '@prisma/client'

const globalForRegistry = globalThis as unknown as { registryPrisma: PrismaClient }

// Scoped to the `public` schema only — the one place allowed to query
// `Tenant`. Never used for business-model queries (those go through the
// tenant-resolving proxy in src/lib/db/prisma.ts). Login flow uses this to
// resolve a company slug to the Postgres schema holding that tenant's data.
export const registryPrisma =
  globalForRegistry.registryPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForRegistry.registryPrisma = registryPrisma

export default registryPrisma
