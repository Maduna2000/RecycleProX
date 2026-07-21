import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidBusinessLoanSchema } from '@/lib/schemas/businessLoan'
import {
  voidBusinessLoan,
  BusinessLoanNotFoundError,
  BusinessLoanAlreadyVoidedError,
  BusinessLoanHasRepaymentsError,
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
  const parsed = VoidBusinessLoanSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const loan = await runWithRequestTenant(req, () => voidBusinessLoan(params.id, parsed.data, session.user.id))
    return NextResponse.json(loan)
  } catch (err) {
    if (err instanceof BusinessLoanNotFoundError)      return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof BusinessLoanAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof BusinessLoanHasRepaymentsError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/business-loans/[id]/void failed')
    return NextResponse.json({ error: 'Failed to void business loan' }, { status: 500 })
  }
}
