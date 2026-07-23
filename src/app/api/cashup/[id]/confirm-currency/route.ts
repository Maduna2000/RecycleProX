import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { confirmCurrency } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// POST /api/cashup/[id]/confirm-currency — manager/admin only
// Acknowledges a currency mismatch against the previous session, unblocking
// submission. Mirrors the manager/admin gate on PUT /api/cashup/[id]/currency.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden — managers only' }, { status: 403 })
  }

  try {
    const cashUp = await runWithRequestTenant(req, () => confirmCurrency(params.id, session.user.id))
    return NextResponse.json({ cashUp })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to confirm currency'
    logger.error({ err, id: params.id }, 'POST /api/cashup/[id]/confirm-currency failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
