import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getScaleStats } from '@/lib/services/scaleService'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const stats = await runWithRequestTenant(req, () => getScaleStats())
    return NextResponse.json(stats)
  } catch (err) {
    logger.error({ err }, 'GET /api/scale/admin/stats failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
