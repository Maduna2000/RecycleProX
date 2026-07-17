import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import { withTenantId } from '@/lib/db/tenantContext'

// ONE-TIME USE — read-only, critical incident diagnostic. Confirms whether
// the live app connection is running as the restricted app_runtime role
// (RLS enforced) or the table-owner role (RLS silently bypassed via
// BYPASSRLS, regardless of policy correctness — see
// i-need-you-to-vectorized-pumpkin.md Section 11's original finding).
// Never exposes any secret/connection-string value, only role metadata.
// Delete after use.
export async function GET() {
  const { response } = await requireRole(['admin'])
  if (response) return response

  // A throwaway, real tenant id just to open a properly-pinned transaction
  // via the normal withTenantScope path (mirrors exactly how every real
  // request resolves its connection) — using Golden Key's own id, read
  // from the registry, so this doesn't hardcode anything.
  const { registryPrisma } = await import('@/lib/db/registryPrisma')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyTenant = await (registryPrisma as any).tenant.findFirst({ select: { id: true } })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = await withTenantId(anyTenant.id, async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).$queryRawUnsafe(`
      SELECT
        current_user as current_user,
        session_user as session_user,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) as bypasses_rls,
        (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'User') as user_table_force_rls,
        (SELECT relrowsecurity FROM pg_class WHERE relname = 'User') as user_table_rls_enabled,
        (SELECT count(*) FROM pg_policies WHERE tablename = 'User') as user_table_policy_count
    `)
    return rows?.[0] ?? null
  })

  return NextResponse.json({ dbConnectionInfo: info })
}
