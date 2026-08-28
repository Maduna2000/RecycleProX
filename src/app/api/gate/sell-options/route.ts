import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateSellOptionSchema } from '@/lib/schemas/gate'
import { listSellOptions, createSellOption } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // The kiosk step only wants active options; the admin management UI
  // passes ?all=1 to see (and manage) inactive ones too.
  const includeInactive = req.nextUrl.searchParams.get('all') === '1'
  const options = await runWithRequestTenant(req, () => listSellOptions(includeInactive))
  return NextResponse.json({ options })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateSellOptionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 422 })

  try {
    const option = await runWithRequestTenant(req, () => createSellOption(parsed.data))
    return NextResponse.json(option, { status: 201 })
  } catch (err) {
    const msg = 'Failed to create sell option'
    const status = msg.includes('already exists') ? 409 : 500
    if (status === 500) logger.error({ err }, 'POST /api/gate/sell-options failed')
    return NextResponse.json({ error: msg }, { status })
  }
}
