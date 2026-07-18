import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { UpdateGatePurposeConfigSchema, GateEntryPurposeSchema } from '@/lib/schemas/gate'
import { getPurposeConfig, updatePurposeConfig } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

export async function GET(req: NextRequest, { params }: { params: { purpose: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsedPurpose = GateEntryPurposeSchema.safeParse(params.purpose)
  if (!parsedPurpose.success) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 422 })
  }

  const config = await runWithRequestTenant(req, () => getPurposeConfig(parsedPurpose.data))
  return NextResponse.json(config)
}

export async function PUT(req: NextRequest, { params }: { params: { purpose: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsedPurpose = GateEntryPurposeSchema.safeParse(params.purpose)
  if (!parsedPurpose.success) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 422 })
  }

  const body = await req.json()
  const parsed = UpdateGatePurposeConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
  }

  try {
    const config = await runWithRequestTenant(req, () => updatePurposeConfig(parsedPurpose.data, parsed.data))
    return NextResponse.json(config)
  } catch (err) {
    logger.error({ err }, 'PUT /api/gate/purpose-config/[purpose] failed')
    return NextResponse.json({ error: 'Failed to update purpose config' }, { status: 500 })
  }
}
