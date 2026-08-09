import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateManualRepaymentSchema } from '@/lib/schemas/loan'
import {
  createManualRepayment,
  NoActiveLoansError,
  RepaymentExceedsBalanceError,
} from '@/lib/services/loanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// POST /api/customers/[id]/loans/repay — customer-level repayment, applied
// FIFO across active loans (no loanId — see createManualRepayment).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = CreateManualRepaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const repayments = await runWithRequestTenant(req, () => createManualRepayment(params.id, parsed.data, session.user.id))
    return NextResponse.json({ repayments }, { status: 201 })
  } catch (err) {
    if (err instanceof NoActiveLoansError)           return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof RepaymentExceedsBalanceError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/customers/[id]/loans/repay failed')
    return NextResponse.json({ error: 'Failed to record repayment' }, { status: 500 })
  }
}
