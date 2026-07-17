import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { unblacklistCustomer, ForbiddenError } from '@/lib/services/customerService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const customer = await runWithRequestTenant(req, () => unblacklistCustomer(params.id, session.user.id, session.user.role))
    return NextResponse.json(customer)
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 })
    logger.error({ err }, 'POST /api/customers/[id]/unblacklist failed')
    return NextResponse.json({ error: 'Failed to unblacklist customer' }, { status: 500 })
  }
}
