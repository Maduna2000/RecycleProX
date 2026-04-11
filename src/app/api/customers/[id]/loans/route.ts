import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { listLoans, getCustomerLoanSummary } from '@/lib/services/loanService'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status   = searchParams.get('status') ?? undefined
  const page     = parseInt(searchParams.get('page')     ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50')

  try {
    const [list, summary] = await Promise.all([
      listLoans({ customerId: params.id, status, page, pageSize }),
      getCustomerLoanSummary(params.id),
    ])
    return NextResponse.json({ ...list, summary })
  } catch (err) {
    logger.error({ err }, 'GET /api/customers/[id]/loans failed')
    return NextResponse.json({ error: 'Failed to fetch customer loans' }, { status: 500 })
  }
}
