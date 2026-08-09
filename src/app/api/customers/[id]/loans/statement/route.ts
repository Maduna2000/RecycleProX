import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { LoanStatementQuerySchema } from '@/lib/schemas/loan'
import { getCustomerLoanStatement } from '@/lib/services/loanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/customers/[id]/loans/statement?period=YYYY-MM
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const parsed = LoanStatementQuerySchema.safeParse({ period: searchParams.get('period') ?? undefined })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const statement = await runWithRequestTenant(req, () => getCustomerLoanStatement(params.id, parsed.data.period))
    return NextResponse.json(statement)
  } catch (err) {
    logger.error({ err }, 'GET /api/customers/[id]/loans/statement failed')
    return NextResponse.json({ error: 'Failed to fetch loan statement' }, { status: 500 })
  }
}
