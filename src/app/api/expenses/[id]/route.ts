import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getExpense, voidExpense } from '@/lib/services/expenseService'
import logger from '@/lib/logger'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const expense = await getExpense(params.id)
    return NextResponse.json(expense)
  } catch {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const expense = await voidExpense(params.id, session.user.id)
    return NextResponse.json(expense)
  } catch (err) {
    logger.error({ err }, 'DELETE /api/expenses/[id] failed')
    return NextResponse.json({ error: 'Failed to void expense' }, { status: 500 })
  }
}
