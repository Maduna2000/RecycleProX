import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { approveExpense } from '@/lib/services/expenseService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — manager or admin required' }, { status: 403 })
  }

  try {
    const expense = await runWithRequestTenant(req, () => approveExpense(params.id, session.user.id))
    return NextResponse.json(expense)
  } catch (err) {
    logger.error({ err }, 'POST /api/expenses/[id]/approve failed')
    return NextResponse.json({ error: 'Failed to approve expense' }, { status: 500 })
  }
}
