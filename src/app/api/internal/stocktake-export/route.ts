import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import logger from '@/lib/logger'
import { KpiExportRequestSchema } from '@/lib/schemas/internal'
import { computeStocktakeExport } from '@/lib/services/stocktakeExportService'
import { withTenantId } from '@/lib/db/tenantContext'
import { authorizeKpiExportRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — same sibling app and shared secret as kpi-export
// (KPI_EXPORT_SHARED_SECRET), just a per-product breakdown instead of
// aggregated totals, for the control tower's Stocktake reconciliation
// feature. Request shape is identical to kpi-export's, so it reuses the
// same schema.
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
    const products = await withTenantId(tenantId, () => computeStocktakeExport(periodStart, periodEnd))
    return NextResponse.json({ products })
  } catch (err) {
    logger.error({ err, tenantId }, 'Stocktake export failed')
    return NextResponse.json({ error: 'Stocktake export failed' }, { status: 500 })
  }
}
