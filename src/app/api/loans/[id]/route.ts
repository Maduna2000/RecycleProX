import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getLoan } from '@/lib/services/loanService'
import { LoanNotFoundError } from '@/lib/services/loanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const loan = await runWithRequestTenant(req, () => getLoan(params.id))
    return NextResponse.json(loan)
  } catch (err) {
    if (err instanceof LoanNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/loans/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch loan' }, { status: 500 })
  }
}
