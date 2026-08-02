import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { quickCreate, PhoneNumberConflictError } from '@/lib/services/customerService'
import { QuickCreateSchema } from '@/lib/schemas/customer'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = QuickCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const customer = await runWithRequestTenant(req, () => quickCreate(parsed.data, session.user.id))
    return NextResponse.json(customer, { status: 200 })
  } catch (err) {
    if (err instanceof PhoneNumberConflictError) {
      return NextResponse.json({ error: err.message, conflicts: err.conflicts }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/customers/quick-create failed')
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
