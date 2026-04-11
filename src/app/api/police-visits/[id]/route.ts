import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { getViewUrl } from '@/lib/r2'

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
    const visit = await prisma.policeVisit.findUnique({ where: { id: params.id } })
    if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

    return NextResponse.json({
      ...visit,
      registerUrl:  visit.registerR2Key  ? await getViewUrl(visit.registerR2Key,  3600) : null,
      signatureUrl: visit.signatureR2Key ? await getViewUrl(visit.signatureR2Key, 3600) : null,
    })
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

  const body = await req.json().catch(() => null)
  const parsed = PatchVisitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const visit = await prisma.policeVisit.update({
      where: { id: params.id },
      data: parsed.data,
    })
    logger.info({ visitId: visit.id, userId: session.user.id }, 'police-visit.updated')
    return NextResponse.json({ visit })
  } catch (err) {
    logger.error({ err, id: params.id }, 'PATCH /api/police-visits/[id] failed')
    return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 })
  }
}
