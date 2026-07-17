import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getSale, SaleNotFoundError } from '@/lib/services/saleService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sale = await runWithRequestTenant(req, () => getSale(params.id))
    return NextResponse.json(sale)
  } catch (err) {
    if (err instanceof SaleNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/sales/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch sale' }, { status: 500 })
  }
}
