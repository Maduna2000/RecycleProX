import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ReverseRepaymentSchema } from '@/lib/schemas/loan'
import {
  reverseRepayment,
  RepaymentNotFoundError,
  RepaymentNotLastEntryError,
} from '@/lib/services/loanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// POST /api/loans/repayments/[id]/reverse — "Delete Last" on the loan
// ledger, when the last entry is a repayment (see reverseRepayment).
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
  const parsed = ReverseRepaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const reversal = await runWithRequestTenant(req, () => reverseRepayment(params.id, parsed.data.reason, session.user.id))
    return NextResponse.json(reversal)
  } catch (err) {
    if (err instanceof RepaymentNotFoundError)     return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof RepaymentNotLastEntryError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/loans/repayments/[id]/reverse failed')
    return NextResponse.json({ error: 'Failed to reverse repayment' }, { status: 500 })
  }
}
