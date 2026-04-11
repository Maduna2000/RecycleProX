import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { getViewUrl } from '@/lib/r2'

const CreateVisitSchema = z.object({
  visitDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD required)'),
  officerName:    z.string().min(2).max(120),
  badgeNumber:    z.string().max(50).optional(),
  stationName:    z.string().max(120).optional(),
  registerR2Key:  z.string().max(500).optional(),
  signatureR2Key: z.string().max(500).optional(),
  notes:          z.string().max(1000).optional(),
})

/**
 * GET /api/police-visits?limit=20&offset=0
 * List police visits ordered by visitDate desc. Manager/admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit  = Math.min(parseInt(req.nextUrl.searchParams.get('limit')  ?? '20'), 100)
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0')

  try {
    const [visits, total] = await Promise.all([
      prisma.policeVisit.findMany({
        orderBy: { visitDate: 'desc' },
        take:    limit,
        skip:    offset,
      }),
      prisma.policeVisit.count(),
    ])

    // Generate signed view URLs for any stored files
    const visitsWithUrls = await Promise.all(
      visits.map(async (v) => ({
        ...v,
        registerUrl:  v.registerR2Key  ? await getViewUrl(v.registerR2Key,  3600) : null,
        signatureUrl: v.signatureR2Key ? await getViewUrl(v.signatureR2Key, 3600) : null,
      }))
    )

    return NextResponse.json({ visits: visitsWithUrls, total })
  } catch (err) {
    logger.error({ err }, 'GET /api/police-visits failed')
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
  }
}

/**
 * POST /api/police-visits
 * Record a police visit. Manager/admin only.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = CreateVisitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  const d = parsed.data
  const [y, m, day] = d.visitDate.split('-').map(Number)
  const visitDate = new Date(y!, m! - 1, day!)

  try {
    const visit = await prisma.policeVisit.create({
      data: {
        visitDate,
        officerName:     d.officerName,
        badgeNumber:     d.badgeNumber,
        stationName:     d.stationName,
        registerR2Key:   d.registerR2Key,
        signatureR2Key:  d.signatureR2Key,
        notes:           d.notes,
        createdByUserId: session.user.id,
      },
    })

    logger.info({ visitId: visit.id, userId: session.user.id, visitDate: d.visitDate }, 'police-visit.created')
    return NextResponse.json({ visit }, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/police-visits failed')
    return NextResponse.json({ error: 'Failed to record visit' }, { status: 500 })
  }
}
