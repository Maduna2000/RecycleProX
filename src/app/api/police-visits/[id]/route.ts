import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { getPoliceVisit, updatePoliceVisit } from '@/lib/services/policeVisitService'

const PatchVisitSchema = z.object({
  signatureR2Key: z.string().max(500).optional(),
  notes:          z.string().max(1000).optional(),
})

/**
 * GET /api/police-visits/[id]
 * Single police visit with signed URLs. Manager/admin only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
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
 * Update signatureR2Key or notes after generation. Manager/admin only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body   = await req.json().catch(() => null)
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
