import logger from '@/lib/logger'

export class CompanyAccessCheckError extends Error {
  constructor(message: string) { super(message); this.name = 'CompanyAccessCheckError' }
}

export interface CompanyAccessResult {
  allowed: boolean
  effectiveStatus: string
  reason: string | null
  schemaName: string | null
  featureFlags: Record<string, boolean>
}

// Calls the Portal's internal, shared-secret-authenticated access-check
// endpoint (GET /api/internal/companies/by-slug/[slug]/access) — the Web
// counterpart of tenantProvisioningClient.ts on the Portal side. This is
// what makes a Portal admin's Suspend button actually block a real login,
// replacing the old dead check against Web's own stale Tenant.status.
export async function checkCompanyAccess(companySlug: string): Promise<CompanyAccessResult> {
  const baseUrl = process.env.RENOVO_PORTAL_BASE_URL
  const secret = process.env.INTERNAL_API_SHARED_SECRET
  if (!baseUrl || !secret) {
    throw new CompanyAccessCheckError('RENOVO_PORTAL_BASE_URL / INTERNAL_API_SHARED_SECRET not configured')
  }

  const res = await fetch(`${baseUrl}/api/internal/companies/by-slug/${companySlug}/access`, {
    headers: { 'x-internal-secret': secret },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.warn({ status: res.status, body, companySlug }, 'Company access check failed')
    throw new CompanyAccessCheckError(`Access check failed with status ${res.status}`)
  }

  return res.json()
}
