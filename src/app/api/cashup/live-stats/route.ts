import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getLiveStats } from '@/lib/services/cashUpService'
import logger from '@/lib/logger'

// GET /api/cashup/live-stats?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const dateStr = searchParams.get('date')
  if (!dateStr) return NextResponse.json({ error: 'date param required' }, { status: 400 })

  const [y, m, d] = dateStr.split('-').map(Number)
  const sessionDate = new Date(y!, m! - 1, d!)

  try {
    const stats = await getLiveStats(sessionDate)
    return NextResponse.json(stats)
  } catch (err) {
    logger.error({ err, dateStr }, 'GET /api/cashup/live-stats failed')
    return NextResponse.json({ error: 'Failed to fetch live stats' }, { status: 500 })
  }
}
