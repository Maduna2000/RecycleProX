import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateBusinessLoanRepaymentSchema } from '@/lib/schemas/businessLoan'
import {
  createBusinessLoanRepayment,
  BusinessLoanNotFoundError,
  BusinessLoanAlreadySettledError,
  BusinessLoanAlreadyVoidedError,
  RepaymentExceedsBalanceError,
} from '@/lib/services/businessLoanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

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
  const parsed = CreateBusinessLoanRepaymentSchema.safeParse({ ...body, businessLoanId: params.id })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const repayment = await runWithRequestTenant(req, () => createBusinessLoanRepayment(parsed.data, session.user.id))
    return NextResponse.json(repayment, { status: 201 })
  } catch (err) {
    if (err instanceof BusinessLoanNotFoundError)        return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof BusinessLoanAlreadySettledError)  return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof BusinessLoanAlreadyVoidedError)   return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof RepaymentExceedsBalanceError)     return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/business-loans/[id]/repay failed')
    return NextResponse.json({ error: 'Failed to create repayment' }, { status: 500 })
  }
}
