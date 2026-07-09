import { PrismaClient } from '@prisma/client'
import { attachAuditMiddleware } from './auditMiddleware'

const MAX_CACHED_CLIENTS = 30

// Insertion order doubles as recency order (re-inserted on access) — a Map's
// first key is always the least-recently-used entry, which is all a bounded
// LRU needs here since eviction just means "reconnect on next use."
const clientCache = new Map<string, PrismaClient>()

function buildTenantDatabaseUrl(schemaName: string): string {
  const base = process.env.DATABASE_URL
  if (!base) throw new Error('DATABASE_URL is not set')

  const url = new URL(base)
  url.searchParams.set('schema', schemaName)
  // Keep each tenant client's own pool small — many tenants share one Neon
  // instance, so this is a deliberate cap, not a default left unconsidered.
  url.searchParams.set('connection_limit', '3')
  return url.toString()
}

function isValidSchemaName(schemaName: string): boolean {
  // Guards against SQL-identifier injection anywhere this name is later used
  // in raw DDL (CREATE SCHEMA / search_path), even though callers here only
  // ever pass values already stored in the Tenant registry.
  return /^[a-z0-9_]+$/.test(schemaName)
}

export function getTenantPrismaClient(schemaName: string): PrismaClient {
  if (!isValidSchemaName(schemaName)) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`)
  }

  const existing = clientCache.get(schemaName)
  if (existing) {
    // Refresh recency by re-inserting.
    clientCache.delete(schemaName)
    clientCache.set(schemaName, existing)
    return existing
  }

  if (clientCache.size >= MAX_CACHED_CLIENTS) {
    const oldestKey = clientCache.keys().next().value
    if (oldestKey) {
      const oldestClient = clientCache.get(oldestKey)
      clientCache.delete(oldestKey)
      void oldestClient?.$disconnect()
    }
  }

  const client = attachAuditMiddleware(
    new PrismaClient({
      datasourceUrl: buildTenantDatabaseUrl(schemaName),
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    }),
  )
  clientCache.set(schemaName, client)
  return client
}
