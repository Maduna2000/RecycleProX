import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import logger from '@/lib/logger'
import { ProvisionTenantSchema } from '@/lib/schemas/internal'
import { provisionCompany } from '@/lib/services/tenantProvisioningService'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — called by the Renovo Pro SaaS Portal right after
// it creates a Company + trial Subscription, never reachable from a browser
// (no session cookie exists that could authorize this).
export async function POST(req: NextRequest) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = ProvisionTenantSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await provisionCompany(parsed.data)
    return NextResponse.json({
      schemaName: result.schemaName,
      tempUsername: result.tempUsername,
      tempPassword: result.tempPassword,
      loginUrl: `https://${parsed.data.companySlug}.${process.env.TENANT_BASE_DOMAIN ?? 'renovopro.app'}/login`,
    }, { status: 201 })
  } catch (err) {
    logger.error({ err, companySlug: parsed.data.companySlug }, 'Tenant provisioning failed')
    return NextResponse.json({ error: 'Provisioning failed' }, { status: 500 })
  }
}
