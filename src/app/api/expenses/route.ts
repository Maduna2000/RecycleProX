import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createExpense, listExpenses } from '@/lib/services/expenseService'
import { CreateExpenseSchema } from '@/lib/schemas/expense'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import { getDayBoundsSAST, sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status      = searchParams.get('status') ?? undefined
  const hideVoided  = searchParams.get('hideVoided') === 'true'
  const search = searchParams.get('search') ?? undefined
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/
  if ((fromParam && !dateLabel.test(fromParam)) || (toParam && !dateLabel.test(toParam))) {
    return NextResponse.json({ error: 'Invalid date filter' }, { status: 400 })
  }
  // Day boundaries are SAST calendar days (UTC+2), independent of server timezone.
  // An open-ended range (only "from" or only "to") uses just that side's bound.
  const from = fromParam ? getDayBoundsSAST(sastDateLabelToUTCDate(fromParam)).start : undefined
  const to   = toParam   ? getDayBoundsSAST(sastDateLabelToUTCDate(toParam)).end     : undefined
  const page   = parseInt(searchParams.get('page') ?? '1')
  const limit  = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined

  const result = await runWithRequestTenant(req, () => listExpenses({ status, hideVoided, search, from, to, page, limit }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const expense = await runWithRequestTenant(req, () => createExpense(parsed.data, session.user.id))
    return NextResponse.json(expense, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/expenses failed')
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
