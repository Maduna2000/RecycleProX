import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getExpense, voidExpense, updateExpense } from '@/lib/services/expenseService'
import { UpdateExpenseSchema } from '@/lib/schemas/expense'
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const expense = await updateExpense(params.id, session.user.id, session.user.role, parsed.data)
    return NextResponse.json(expense)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update expense'
    logger.error({ err, expenseId: params.id }, 'PATCH /api/expenses/[id] failed')

    if (message === 'Expense not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message === 'Not authorized to edit this expense') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (message === 'Expense already approved' || message === 'Expense has been voided') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (message === 'Expense was modified by another user') {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
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
