import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { CreateBusinessLoanSchema } from '@/lib/schemas/businessLoan'
import {
  createBusinessLoan,
  getCustomerBusinessLoanSummaryForRole,
  CustomerBlacklistedError,
  CustomerInactiveError,
} from '@/lib/services/businessLoanService'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const summary = await runWithRequestTenant(req, () =>
      getCustomerBusinessLoanSummaryForRole(params.id, session.user.role))
    return NextResponse.json(summary)
  } catch (err) {
    logger.error({ err }, 'GET /api/customers/[id]/business-loans failed')
    return NextResponse.json({ error: 'Failed to fetch business loans' }, { status: 500 })
  }
}

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
  const parsed = CreateBusinessLoanSchema.safeParse({ ...body, customerId: params.id })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const loan = await runWithRequestTenant(req, () => createBusinessLoan(parsed.data, session.user.id))
    return NextResponse.json(loan, { status: 201 })
  } catch (err) {
    if (err instanceof CustomerBlacklistedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof CustomerInactiveError)    return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/customers/[id]/business-loans failed')
    return NextResponse.json({ error: 'Failed to create business loan' }, { status: 500 })
  }
}
