import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { listFloatMovements } from '@/lib/services/floatService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/float/history?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=50
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp       = req.nextUrl.searchParams
  const fromStr  = sp.get('from')
  const toStr    = sp.get('to')
  const page     = Math.max(1, parseInt(sp.get('page')     ?? '1',  10))
  const pageSize = Math.min(100, parseInt(sp.get('pageSize') ?? '50', 10))

  const from = fromStr ? (() => { const d = new Date(fromStr); d.setHours(0,0,0,0); return d })() : undefined
  const to   = toStr   ? (() => { const d = new Date(toStr);   d.setHours(23,59,59,999); return d })() : undefined

  try {
    const result = await runWithRequestTenant(req, () => listFloatMovements({ from, to, page, pageSize }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/float/history failed')
    return NextResponse.json({ error: 'Failed to fetch float history' }, { status: 500 })
  }
}
