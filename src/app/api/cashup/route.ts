import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { OpenCashUpSchema } from '@/lib/schemas/cashup'
import { openCashUp, listCashUps, getOpenSession, getAnyOpenSession } from '@/lib/services/cashUpService'

// GET /api/cashup — list history OR ?today=1 for the open session
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl

  try {
    if (searchParams.get('today') === '1') {
      // First check for any open session (could be from a previous day that needs submission)
      const openSession = await getAnyOpenSession()
      if (openSession) {
        return NextResponse.json({ cashUp: openSession })
      }
      // No open session, check for today's submitted session
      const dateStr = searchParams.get('date') ?? undefined
      const cashUp = await getOpenSession(dateStr)
      return NextResponse.json({ cashUp })
    }

    const skip = parseInt(searchParams.get('skip') ?? '0', 10)
    const take = parseInt(searchParams.get('take') ?? '30', 10)
    const result = await listCashUps({ skip, take })
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/cashup failed')
    return NextResponse.json({ error: 'Failed to fetch cash-up data' }, { status: 500 })
  }
}

// POST /api/cashup — open a new session (any role)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = OpenCashUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const cashUp = await openCashUp(session.user.id, parsed.data.sessionDate, parsed.data.currency)
    return NextResponse.json({ cashUp }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to open cash-up session'
    logger.error({ err }, 'POST /api/cashup failed')
    // Return 409 Conflict if previous day's session is still open
    if (message.includes('previous day')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
