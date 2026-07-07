import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { RegisterSearchSchema } from '@/lib/schemas/police'
import { searchRegisterByDate, PoliceVisitNotActiveError } from '@/lib/services/policeVisitService'

/**
 * GET /api/police-search/register?visitId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Register-by-date search for an active inspection session.
 * The search is logged server-side in the same transaction as the query.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const parsed = RegisterSearchSchema.safeParse({
    visitId: sp.get('visitId'),
    from:    sp.get('from'),
    to:      sp.get('to'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const result = await searchRegisterByDate(parsed.data.visitId, parsed.data.from, parsed.data.to)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof PoliceVisitNotActiveError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 409 })
    }
    logger.error({ err }, 'GET /api/police-search/register failed')
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
