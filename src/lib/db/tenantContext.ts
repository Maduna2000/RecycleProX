import { AsyncLocalStorage } from 'node:async_hooks'

export interface TenantContextValue {
  schemaName: string
  companySlug: string
}

// Populated once per request (see src/auth.ts) so every downstream call to
// the `prisma` proxy (src/lib/db/prisma.ts) resolves to the right tenant's
// Postgres schema without any service or API route needing to pass it
// through explicitly. Node-runtime only — never imported by auth.config.ts
// or middleware.ts, which run in the Edge runtime.
export const tenantContext = new AsyncLocalStorage<TenantContextValue>()
