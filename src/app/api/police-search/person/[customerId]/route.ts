import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { getPersonDetail, PoliceVisitNotActiveError } from '@/lib/services/policeVisitService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const ParamsSchema = z.object({
  visitId:    z.string().uuid(),
  customerId: z.string().uuid(),
})

/**
 * GET /api/police-search/person/[customerId]?visitId=
 * Full person profile + transaction history for an active inspection session.
 * The disclosure is logged server-side like a search.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = ParamsSchema.safeParse({
    visitId:    req.nextUrl.searchParams.get('visitId'),
    customerId: params.customerId,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const detail = await runWithRequestTenant(req, () => getPersonDetail(parsed.data.visitId, parsed.data.customerId))
    if (!detail) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    return NextResponse.json(detail)
  } catch (err) {
    if (err instanceof PoliceVisitNotActiveError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 409 })
    }
    logger.error({ err, customerId: params.customerId }, 'GET /api/police-search/person/[customerId] failed')
    return NextResponse.json({ error: 'Failed to load person' }, { status: 500 })
  }
}
