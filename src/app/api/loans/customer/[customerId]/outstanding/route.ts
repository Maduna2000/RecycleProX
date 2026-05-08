import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getCustomerLoanSummary } from '@/lib/services/loanService'

// GET /api/loans/customer/[customerId]/outstanding
// Returns the outstanding loan balance and summary for a customer.
export async function GET(
  _req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const summary = await getCustomerLoanSummary(params.customerId)
    return NextResponse.json(summary)
  } catch (err) {
    logger.error({ err, customerId: params.customerId }, 'GET /api/loans/customer/[customerId]/outstanding failed')
    return NextResponse.json({ error: 'Failed to fetch loan summary' }, { status: 500 })
  }
}
