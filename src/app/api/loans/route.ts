import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateLoanSchema } from '@/lib/schemas/loan'
import {
  createLoan, listLoans,
  CustomerBlacklistedError, CustomerInactiveError,
} from '@/lib/services/loanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const customerId = searchParams.get('customerId') ?? undefined
  const status     = searchParams.get('status') ?? undefined
  const search     = searchParams.get('search') ?? undefined
  const page       = parseInt(searchParams.get('page')     ?? '1')
  const pageSize   = parseInt(searchParams.get('pageSize') ?? '50')
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined
  const to   = searchParams.get('to')   ? new Date(searchParams.get('to')!)   : undefined

  try {
    const result = await runWithRequestTenant(req, () => listLoans({ customerId, status, search, page, pageSize, from, to }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/loans failed')
    return NextResponse.json({ error: 'Failed to fetch loans' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = CreateLoanSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const loan = await runWithRequestTenant(req, () => createLoan(parsed.data, session.user.id))
    return NextResponse.json(loan, { status: 201 })
  } catch (err) {
    if (err instanceof CustomerBlacklistedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof CustomerInactiveError)    return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/loans failed')
    return NextResponse.json({ error: 'Failed to create loan' }, { status: 500 })
  }
}
