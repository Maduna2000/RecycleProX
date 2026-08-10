import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { BusinessLoanStatementQuerySchema } from '@/lib/schemas/businessLoan'
import { getCustomerBusinessLoanStatement } from '@/lib/services/businessLoanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/customers/[id]/business-loans/statement?period=YYYY-MM
// Admin only — same figures-visibility rule as the rest of the Business Loan
// tab (getCustomerBusinessLoanSummaryForRole masks this for everyone else).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin required' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const parsed = BusinessLoanStatementQuerySchema.safeParse({ period: searchParams.get('period') ?? undefined })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const statement = await runWithRequestTenant(req, () => getCustomerBusinessLoanStatement(params.id, parsed.data.period))
    return NextResponse.json(statement)
  } catch (err) {
    logger.error({ err }, 'GET /api/customers/[id]/business-loans/statement failed')
    return NextResponse.json({ error: 'Failed to fetch business loan statement' }, { status: 500 })
  }
}
