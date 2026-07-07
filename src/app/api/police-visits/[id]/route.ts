import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { EndInspectionSchema } from '@/lib/schemas/police'
import {
  getPoliceVisit,
  updatePoliceVisit,
  endInspection,
  PoliceVisitNotActiveError,
} from '@/lib/services/policeVisitService'

const PatchVisitSchema = z.object({
  signatureR2Key: z.string().max(500).optional(),
  notes:          z.string().max(1000).optional(),
})

/**
 * GET /api/police-visits/[id]
 * Single police visit with signed URLs and search logs.
 * Cashiers may read too — the portal restores its session state from this.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const visit = await getPoliceVisit(params.id)
    if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
    return NextResponse.json(visit)
  } catch (err) {
    logger.error({ err, id: params.id }, 'GET /api/police-visits/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch visit' }, { status: 500 })
  }
}

/**
 * PATCH /api/police-visits/[id]
 * Two modes:
 *  - { action: 'sign', signatureR2Key } — officer signs off an active session
 *    (any staff role except scale_operator, since a cashier may supervise).
 *  - { action: 'force_end' } — manager/admin ends an abandoned session.
 *  - Legacy body { signatureR2Key?, notes? } — manager/admin update after PDF generation.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  // ── End-inspection mode ──
  if (typeof body.action === 'string') {
    const parsed = EndInspectionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
    }

    const allowedRoles = parsed.data.action === 'force_end'
      ? ['admin', 'manager']
      : ['admin', 'manager', 'cashier']
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const visit = await endInspection(params.id, parsed.data, session.user.id)
      return NextResponse.json({ visit })
    } catch (err) {
      if (err instanceof PoliceVisitNotActiveError) {
        return NextResponse.json({ error: err.message, reason: err.reason }, { status: 409 })
      }
      logger.error({ err, id: params.id }, 'PATCH /api/police-visits/[id] end-inspection failed')
      return NextResponse.json({ error: 'Failed to end inspection' }, { status: 500 })
    }
  }

  // ── Legacy update mode ──
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = PatchVisitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const visit = await updatePoliceVisit(params.id, parsed.data, session.user.id)
    return NextResponse.json({ visit })
  } catch (err) {
    logger.error({ err, id: params.id }, 'PATCH /api/police-visits/[id] failed')
    return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 })
  }
}
