import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { getCashUpHistory } from '@/lib/services/cashUpService'

const QuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().optional(),
})

/**
 * GET /api/cashup/history?status=submitted,approved&skip=0&take=50
 *
 * Returns a list of past cashup sessions for the Previous Reports modal.
 * Only returns submitted and approved sessions by default.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query params
  const skipParam = req.nextUrl.searchParams.get('skip')
  const takeParam = req.nextUrl.searchParams.get('take')
  const statusParam = req.nextUrl.searchParams.get('status')

  const parseResult = QuerySchema.safeParse({
    skip: skipParam ?? 0,
    take: takeParam ?? 50,
    status: statusParam,
  })

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const { skip, take, status } = parseResult.data

  // Parse status filter
  const statusFilter = status
    ? status.split(',').map((s) => s.trim()).filter(Boolean)
    : ['submitted', 'approved']

  try {
    const { items, total } = await getCashUpHistory({
      skip,
      take,
      status: statusFilter,
    })

    return NextResponse.json({
      sessions: items,
      total,
      skip,
      take,
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/cashup/history failed')
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
