import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidLoanSchema } from '@/lib/schemas/loan'
import {
  voidLoan,
  LoanNotFoundError,
  LoanAlreadyVoidedError,
  LoanHasRepaymentsError,
} from '@/lib/services/loanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — manager or admin required' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = VoidLoanSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const loan = await runWithRequestTenant(req, () => voidLoan(params.id, parsed.data, session.user.id))
    return NextResponse.json(loan)
  } catch (err) {
    if (err instanceof LoanNotFoundError)      return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof LoanAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof LoanHasRepaymentsError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/loans/[id]/void failed')
    return NextResponse.json({ error: 'Failed to void loan' }, { status: 500 })
  }
}
