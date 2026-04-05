import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createExpense, listExpenses } from '@/lib/services/expenseService'
import { CreateExpenseSchema } from '@/lib/schemas/expense'
import logger from '@/lib/logger'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? undefined
  const from   = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined
  const to     = searchParams.get('to')   ? new Date(searchParams.get('to')!)   : undefined
  const page   = parseInt(searchParams.get('page') ?? '1')

  const result = await listExpenses({ status, from, to, page })
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
    const expense = await createExpense(parsed.data, session.user.id)
    return NextResponse.json(expense, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/expenses failed')
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
