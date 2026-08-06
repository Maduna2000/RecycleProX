import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { previewOpeningBalance } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/cashup/opening-balance-preview — read-only preview of what
// opening a new session right now would look like (see
// previewOpeningBalance's own comment). Cached client-side so the desktop
// app can offer a safe PROVISIONAL session open while offline.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dateStr = req.nextUrl.searchParams.get('date') ?? undefined

  try {
    const preview = await runWithRequestTenant(req, () => previewOpeningBalance(dateStr))
    return NextResponse.json(preview)
  } catch (err) {
    logger.error({ err }, 'GET /api/cashup/opening-balance-preview failed')
    return NextResponse.json({ error: 'Failed to preview opening balance' }, { status: 500 })
  }
}
