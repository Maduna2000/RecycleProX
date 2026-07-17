import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { updateSalePhotos, SaleNotFoundError } from '@/lib/services/saleService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// PATCH /api/sales/[id]/photos
// Body: { add: string } | { remove: string }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body   = await req.json() as { add?: string; remove?: string }
    const result = await runWithRequestTenant(req, () => updateSalePhotos(params.id, body, session.user?.id ?? ''))
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof SaleNotFoundError) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }
    if (err instanceof Error && err.message === 'Provide add or remove') {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    logger.error({ err }, 'PATCH /api/sales/[id]/photos failed')
    return NextResponse.json({ error: 'Failed to update photos' }, { status: 500 })
  }
}
