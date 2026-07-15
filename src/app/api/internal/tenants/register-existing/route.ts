import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import logger from '@/lib/logger'
import { RegisterExistingTenantSchema } from '@/lib/schemas/internal'
import { registerExistingTenant } from '@/lib/services/tenantProvisioningService'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — one-off registration of a schema that already
// holds real data (Golden Key's production data in `public`, predating
// multi-tenancy) as a formal Tenant. Never reachable from a browser, and
// deliberately separate from POST /api/internal/tenants (which always
// creates + migrates + seeds a brand-new, empty schema — wrong for a tenant
// whose data already exists).
export async function POST(req: NextRequest) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = RegisterExistingTenantSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await registerExistingTenant(parsed.data)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    logger.error({ err, companySlug: parsed.data.companySlug }, 'Existing-tenant registration failed')
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Registration failed' }, { status: 500 })
  }
}
