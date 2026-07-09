import { PrismaClient } from '@prisma/client'
import { attachAuditMiddleware } from './auditMiddleware'
import { tenantContext } from './tenantContext'
import { getTenantPrismaClient } from './tenantPrismaCache'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// The original single-tenant client, unchanged — still what every request
// gets today, since nothing populates tenantContext yet (see
// src/lib/db/tenantContext.ts). Once tenant login resolution is wired into
// src/auth.ts, requests carrying a tenant context transparently start
// resolving to that tenant's own Postgres schema instead, with zero changes
// required in any of the ~50 files that import `prisma` from here.
const defaultClient =
  globalForPrisma.prisma ||
  attachAuditMiddleware(
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    }),
  )

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = defaultClient

function resolveClient(): PrismaClient {
  const ctx = tenantContext.getStore()
  return ctx ? getTenantPrismaClient(ctx.schemaName) : defaultClient
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = resolveClient()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export default prisma
