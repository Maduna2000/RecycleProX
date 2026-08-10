import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ReverseBusinessLoanRepaymentSchema } from '@/lib/schemas/businessLoan'
import {
  reverseManualBusinessLoanRepayment,
  BusinessLoanRepaymentNotFoundError,
  BusinessLoanRepaymentNotLastEntryError,
} from '@/lib/services/businessLoanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// POST /api/business-loans/repayments/[id]/reverse — "Delete Last" on the
// Business Loan ledger, when the last entry is a repayment.
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
  const parsed = ReverseBusinessLoanRepaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const reversal = await runWithRequestTenant(req, () => reverseManualBusinessLoanRepayment(params.id, parsed.data.reason, session.user.id))
    return NextResponse.json(reversal)
  } catch (err) {
    if (err instanceof BusinessLoanRepaymentNotFoundError)     return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof BusinessLoanRepaymentNotLastEntryError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/business-loans/repayments/[id]/reverse failed')
    return NextResponse.json({ error: 'Failed to reverse repayment' }, { status: 500 })
  }
}
