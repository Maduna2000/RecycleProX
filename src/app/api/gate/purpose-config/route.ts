import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listPurposeConfigs } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const configs = await runWithRequestTenant(req, () => listPurposeConfigs())
  return NextResponse.json({ configs })
}
