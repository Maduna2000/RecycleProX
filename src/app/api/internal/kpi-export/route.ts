import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import logger from '@/lib/logger'
import { KpiExportRequestSchema } from '@/lib/schemas/internal'
import { computeKpiExport } from '@/lib/services/kpiExportService'
import { withTenantId } from '@/lib/db/tenantContext'
import { authorizeKpiExportRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — called by the sibling "golden-key-control-tower"
// app's sync runner to pull one tenant's KPIs for a period. Each yard is its
// own Tenant (see tenantProvisioningService.ts), so `tenantId` here is
// exactly what that app stores as Branch.recycleproxBranchRef.
export async function POST(req: NextRequest) {
  if (!authorizeKpiExportRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = KpiExportRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { tenantId, periodStart, periodEnd } = parsed.data

  try {
    const result = await withTenantId(tenantId, () => computeKpiExport(periodStart, periodEnd))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err, tenantId }, 'KPI export failed')
    return NextResponse.json({ error: 'KPI export failed' }, { status: 500 })
  }
}
