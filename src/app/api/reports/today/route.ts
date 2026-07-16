import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getTodayStats } from '@/lib/services/reportService'

/**
 * GET /api/reports/today
 * Quick dashboard KPIs for today. All authenticated users.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const stats = await runWithRequestTenant(req, () => getTodayStats())
    return NextResponse.json(stats)
  } catch (err) {
    logger.error({ err }, 'GET /api/reports/today failed')
    return NextResponse.json({ error: 'Failed to fetch today stats' }, { status: 500 })
  }
}
