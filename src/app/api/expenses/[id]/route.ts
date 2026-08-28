import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getExpense, voidExpense, updateExpense } from '@/lib/services/expenseService'
import { UpdateExpenseSchema, VoidExpenseSchema } from '@/lib/schemas/expense'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const expense = await runWithRequestTenant(req, () => getExpense(params.id))
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
    const expense = await runWithRequestTenant(req, () => updateExpense(params.id, session.user.id, session.user.role, parsed.data))
    return NextResponse.json(expense)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
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
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = VoidExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const expense = await runWithRequestTenant(req, () => voidExpense(params.id, session.user.id, parsed.data.reason))
    return NextResponse.json(expense)
  } catch (err) {
    logger.error({ err }, 'DELETE /api/expenses/[id] failed')
    return NextResponse.json({ error: 'Failed to void expense' }, { status: 500 })
  }
}
