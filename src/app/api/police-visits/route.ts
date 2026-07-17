import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { listPoliceVisits, createPoliceVisit } from '@/lib/services/policeVisitService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const CreateVisitSchema = z.object({
  visitDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD required)'),
  officerName:     z.string().min(2).max(120),
  badgeNumber:     z.string().max(50).optional(),
  stationName:     z.string().max(120).optional(),
  registerR2Key:   z.string().max(500).optional(),
  signatureR2Key:  z.string().max(500).optional(),
  notes:           z.string().max(1000).optional(),
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
    const result = await runWithRequestTenant(req, () => listPoliceVisits({ limit, offset }))
    return NextResponse.json(result)
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

  const body   = await req.json().catch(() => null)
  const parsed = CreateVisitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  const d = parsed.data
  const [y, m, day] = d.visitDate.split('-').map(Number)
  // UTC midnight — @db.Date truncates the UTC value, so local midnight would
  // shift to the previous day in timezones ahead of UTC.
  const visitDate = new Date(Date.UTC(y!, m! - 1, day!))

  try {
    const visit = await runWithRequestTenant(req, () => createPoliceVisit(
      {
        visitDate,
        officerName:    d.officerName,
        badgeNumber:    d.badgeNumber,
        stationName:    d.stationName,
        registerR2Key:  d.registerR2Key,
        signatureR2Key: d.signatureR2Key,
        notes:          d.notes,
      },
      session.user.id
    ))
    return NextResponse.json({ visit }, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/police-visits failed')
    return NextResponse.json({ error: 'Failed to record visit' }, { status: 500 })
  }
}
