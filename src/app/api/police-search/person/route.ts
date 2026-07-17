import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { PersonSearchSchema } from '@/lib/schemas/police'
import { searchPersons, PoliceVisitNotActiveError } from '@/lib/services/policeVisitService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * GET /api/police-search/person?visitId=&q=
 * Person search by name, company or ID number for an active inspection session.
 * Logged server-side in the same transaction as the query.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const parsed = PersonSearchSchema.safeParse({ visitId: sp.get('visitId'), q: sp.get('q') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const result = await runWithRequestTenant(req, () => searchPersons(parsed.data.visitId, parsed.data.q))
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof PoliceVisitNotActiveError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 409 })
    }
    logger.error({ err }, 'GET /api/police-search/person failed')
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
