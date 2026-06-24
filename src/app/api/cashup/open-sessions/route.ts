import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getAllOpenSessions } from '@/lib/services/cashUpService'

// GET /api/cashup/open-sessions — list all open sessions
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sessions = await getAllOpenSessions()
    return NextResponse.json({ sessions })
  } catch (err) {
    logger.error({ err }, 'GET /api/cashup/open-sessions failed')
    return NextResponse.json({ error: 'Failed to fetch open sessions' }, { status: 500 })
  }
}
