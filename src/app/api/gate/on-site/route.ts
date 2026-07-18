import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getOnSiteCount, listOnSiteEntries } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

/** GET /api/gate/on-site — count + short list of entries with no checkout yet, for the dashboard tile. */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [count, entries] = await runWithRequestTenant(req, () => Promise.all([
    getOnSiteCount(),
    listOnSiteEntries(10),
  ]))
  return NextResponse.json({ count, entries })
}
