import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { CreateGateEntrySchema } from '@/lib/schemas/gate'
import {
  createGateEntry, listGateEntries,
  GateVisitorBlacklistedError, GateRequiredPhotoMissingError,
  type GateEntryFilters,
} from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const filters: GateEntryFilters = {
    purpose:    (searchParams.get('purpose') as GateEntryFilters['purpose']) ?? undefined,
    onSiteOnly: searchParams.get('onSiteOnly') === 'true',
    dateFrom:   searchParams.get('dateFrom') ?? undefined,
    dateTo:     searchParams.get('dateTo') ?? undefined,
    search:     searchParams.get('search') ?? undefined,
    page:       parseInt(searchParams.get('page') ?? '1'),
    pageSize:   parseInt(searchParams.get('pageSize') ?? '50'),
  }

  const result = await runWithRequestTenant(req, () => listGateEntries(filters))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateGateEntrySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
  }

  try {
    const entry = await runWithRequestTenant(req, () => createGateEntry(parsed.data, session.user.id))
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    if (err instanceof GateVisitorBlacklistedError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    if (err instanceof GateRequiredPhotoMissingError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    logger.error({ err }, 'POST /api/gate/entries failed')
    return NextResponse.json({ error: 'Failed to create gate entry' }, { status: 500 })
  }
}
