import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { settlePendingExpense } from '@/lib/services/expenseService'
import { SettlePendingExpenseSchema } from '@/lib/schemas/expense'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = SettlePendingExpenseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const expense = await runWithRequestTenant(req, () => settlePendingExpense(params.id, session.user.id, session.user.role, parsed.data))
    return NextResponse.json(expense)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    logger.error({ err, expenseId: params.id }, 'POST /api/expenses/[id]/settle failed')

    if (message === 'Expense not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message === 'Not authorized to settle this expense') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (message === 'Expense already approved' || message === 'Expense has been voided') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (message === 'Expense was modified by another user') {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    if (message.includes('Change received cannot exceed') || message.includes('Actual expense amount')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to settle expense' }, { status: 500 })
  }
}
