import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getCurrentFloat } from '@/lib/services/floatService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/float/current
// Returns today's float record with movements and computed current balance.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const float = await runWithRequestTenant(req, () => getCurrentFloat())
    if (!float) return NextResponse.json({ float: null })
    return NextResponse.json({ float })
  } catch (err) {
    logger.error({ err }, 'GET /api/float/current failed')
    return NextResponse.json({ error: 'Failed to fetch current float' }, { status: 500 })
  }
}
