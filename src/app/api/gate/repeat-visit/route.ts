import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getRepeatVisitInfo } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

/** GET /api/gate/repeat-visit?idNumber= — how many times this ID has entered before. */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const idNumber = req.nextUrl.searchParams.get('idNumber')
  if (!idNumber) return NextResponse.json({ error: 'idNumber query param is required' }, { status: 422 })

  const info = await runWithRequestTenant(req, () => getRepeatVisitInfo(idNumber))
  return NextResponse.json(info)
}
