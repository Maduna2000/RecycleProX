import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { blacklistCustomer, ForbiddenError } from '@/lib/services/customerService'
import { BlacklistSchema } from '@/lib/schemas/customer'
import logger from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = BlacklistSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const customer = await blacklistCustomer(params.id, parsed.data.reason, session.user.id, session.user.role)
    return NextResponse.json(customer)
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 })
    logger.error({ err }, 'POST /api/customers/[id]/blacklist failed')
    return NextResponse.json({ error: 'Failed to blacklist customer' }, { status: 500 })
  }
}
