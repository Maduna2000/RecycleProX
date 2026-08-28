import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ApproveCashUpSchema } from '@/lib/schemas/cashup'
import { approveCashUp } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// POST /api/cashup/[id]/approve — manager/admin only
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
    const body = await req.json().catch(() => ({}))
    const parsed = ApproveCashUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const cashUp = await runWithRequestTenant(req, () => approveCashUp(params.id, session.user.id, parsed.data))
    return NextResponse.json({ cashUp })
  } catch (err: unknown) {
    const msg = 'Failed to approve cash-up'
    logger.error({ err, id: params.id }, 'POST /api/cashup/[id]/approve failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
