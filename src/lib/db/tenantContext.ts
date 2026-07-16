import { AsyncLocalStorage } from 'node:async_hooks'
import { headers } from 'next/headers'
import { registryPrisma } from './registryPrisma'

export interface TenantContextValue {
  tenantId: string
  // Kept alongside tenantId for the rollback window (see
  // i-need-you-to-vectorized-pumpkin.md Section 9) and because
  // src/lib/r2/index.ts still prefixes storage keys by schemaName. tenantId
  // is the field that actually drives RLS scoping (src/lib/db/prisma.ts) —
  // schemaName/companySlug are informational only post-migration.
  schemaName: string
  companySlug: string
}

// Populated once per request (see src/auth.ts) so every downstream call to
// the `prisma` proxy (src/lib/db/prisma.ts) resolves to the right tenant
// without any service or API route needing to pass it through explicitly.
// Node-runtime only — never imported by auth.config.ts or middleware.ts,
// which run in the Edge runtime.
export const tenantContext = new AsyncLocalStorage<TenantContextValue>()

// Tracks the currently-open tenant-scoped transaction client, if any — lets
// nested prisma.* calls made from inside an already-open withTenantScope()
// block (src/lib/db/prisma.ts) reuse that same transaction/connection
// instead of opening a second one. Postgres has no true nested transactions,
// and the set_config(..., true) tenant pin only applies to the transaction
// it was issued in, so reuse (not re-pinning) is required for correctness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const activeTenantTx = new AsyncLocalStorage<any>()

export class MissingTenantContextError extends Error {
  constructor() {
    super(
      'No tenant context set — every business-model query must run inside ' +
        'a resolved tenant context. Request handlers get this from auth() ' +
        '(src/auth.ts); scripts/background jobs must call withTenantId().',
    )
    this.name = 'MissingTenantContextError'
  }
}

// Reads tenantId in this priority order:
// 1. tenantContext's AsyncLocalStorage store — populated via withTenantId()
//    (scripts: seed.ts, backfill jobs) using .run(), which reliably
//    propagates through everything it wraps.
// 2. The x-tenant-id request header — set by middleware.ts from the
//    session, for every real HTTP request. Read via next/headers, which is
//    Next.js's OWN request-scoped storage, not ours.
//
// NOT src/auth.ts's tenantContext.enterWith() call, despite that being the
// original design — found (live incident, see
// i-need-you-to-vectorized-pumpkin.md Section 11) to never actually reach
// the calling route handler: an async function's enterWith() only affects
// code running inside that same function's own continuation. Code that
// awaited it (e.g. `const session = await auth()`) resumes in the context
// that was active before the call, not whatever auth() mutated internally
// — so it reliably failed on every single request, 100% of the time.
export function requireTenantId(): string {
  const ctx = tenantContext.getStore()
  if (ctx) return ctx.tenantId

  try {
    const tenantId = headers().get('x-tenant-id')
    if (tenantId) return tenantId
  } catch {
    // headers() throws outside an active request scope (e.g. a script) —
    // fall through to the error below.
  }

  throw new MissingTenantContextError()
}

// Escape hatch for non-request contexts (backfill/admin scripts, seed.ts)
// that need to act as a specific tenant with no HTTP request/session to
// derive context from. Never used by request-handling code, which always
// derives context from auth(). Looks up schemaName/companySlug from the
// registry so callers only need to know the tenant id.
export async function withTenantId<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (registryPrisma as any).tenant.findUniqueOrThrow({ where: { id: tenantId } })
  return tenantContext.run(
    { tenantId: tenant.id, schemaName: tenant.schemaName, companySlug: tenant.companySlug },
    fn,
  )
}
