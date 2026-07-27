import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { RecordBusinessLoanRepaymentSchema } from '@/lib/schemas/businessLoan'
import {
  recordBusinessLoanRepayment,
  BusinessLoanNotFoundError,
  BusinessLoanAlreadyVoidedError,
  BusinessLoanAlreadySettledError,
  BusinessLoanRepaymentExceedsBalanceError,
} from '@/lib/services/businessLoanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// POST /api/business-loans/[id]/repay — record a payment against what the
// business owes on this loan. Admin-only, same visibility boundary as the
// rest of the Business Loan tab.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin required' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = RecordBusinessLoanRepaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const repayments = await runWithRequestTenant(req, () =>
      recordBusinessLoanRepayment(params.id, parsed.data.payments, session.user.id, parsed.data.notes)
    )
    return NextResponse.json({ repayments }, { status: 201 })
  } catch (err) {
    if (err instanceof BusinessLoanNotFoundError)                return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof BusinessLoanAlreadyVoidedError)           return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof BusinessLoanAlreadySettledError)          return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof BusinessLoanRepaymentExceedsBalanceError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/business-loans/[id]/repay failed')
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
