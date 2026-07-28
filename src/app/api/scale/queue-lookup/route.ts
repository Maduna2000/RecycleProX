import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { QueueNumberSchema } from '@/lib/schemas/scale'
import {
  getGateEntryByQueueNumber, QueueNumberNotFoundError, QueueNumberAlreadyUsedError, GateVisitorBlacklistedError,
} from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const SCALE_ROLES = ['admin', 'manager', 'cashier', 'scale_operator']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SCALE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = QueueNumberSchema.safeParse(req.nextUrl.searchParams.get('queueNumber'))
  if (!parsed.success) return NextResponse.json({ error: 'A valid queue number is required' }, { status: 422 })

  try {
    const entry = await runWithRequestTenant(req, () => getGateEntryByQueueNumber(parsed.data))
    return NextResponse.json({
      gateEntryId: entry.id,
      queueNumber: entry.queueNumber,
      customer: entry.customer
        ? { id: entry.customer.id, firstName: entry.customer.firstName, lastName: entry.customer.lastName, phone: entry.customer.phone }
        : { id: null, firstName: entry.visitorFirstName, lastName: entry.visitorLastName, phone: entry.visitorPhone ?? '', idNumber: entry.visitorIdNumber },
    })
  } catch (err) {
    if (err instanceof QueueNumberNotFoundError)    return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof QueueNumberAlreadyUsedError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof GateVisitorBlacklistedError) return NextResponse.json({ error: err.message }, { status: 403 })
    logger.error({ err }, 'GET /api/scale/queue-lookup failed')
    return NextResponse.json({ error: 'Failed to look up queue number' }, { status: 500 })
  }
}
