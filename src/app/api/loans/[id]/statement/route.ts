import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getLoan, LoanNotFoundError } from '@/lib/services/loanService'

// GET /api/loans/[id]/statement
// Returns full loan details with all repayments for a statement view.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const loan = await getLoan(params.id)
    return NextResponse.json(loan)
  } catch (err) {
    if (err instanceof LoanNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error({ err, id: params.id }, 'GET /api/loans/[id]/statement failed')
    return NextResponse.json({ error: 'Failed to fetch loan statement' }, { status: 500 })
  }
}
