import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateRepaymentSchema } from '@/lib/schemas/loan'
import {
  createRepayment,
  LoanNotFoundError,
  LoanAlreadySettledError,
  LoanAlreadyVoidedError,
  RepaymentExceedsBalanceError,
} from '@/lib/services/loanService'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = CreateRepaymentSchema.safeParse({ ...body, loanId: params.id })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const repayment = await createRepayment(parsed.data, session.user.id)
    return NextResponse.json(repayment, { status: 201 })
  } catch (err) {
    if (err instanceof LoanNotFoundError)          return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof LoanAlreadySettledError)    return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof LoanAlreadyVoidedError)     return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof RepaymentExceedsBalanceError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/loans/[id]/repay failed')
    return NextResponse.json({ error: 'Failed to create repayment' }, { status: 500 })
  }
}
