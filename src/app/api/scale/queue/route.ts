import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { listOpenQueue } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const SCALE_ROLES = ['admin', 'manager', 'cashier', 'scale_operator']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SCALE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const entries = await runWithRequestTenant(req, () => listOpenQueue())
    const queue = entries.map((e) => ({
      gateEntryId: e.id,
      queueNumber: e.queueNumber,
      name: e.customer ? `${e.customer.firstName} ${e.customer.lastName}` : `${e.visitorFirstName} ${e.visitorLastName}`,
      isAccountHolder: !!e.customer,
      createdAt: e.createdAt,
    }))
    return NextResponse.json({ queue })
  } catch (err) {
    logger.error({ err }, 'GET /api/scale/queue failed')
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 })
  }
}
