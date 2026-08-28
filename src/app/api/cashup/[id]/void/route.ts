import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { voidCashUp } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { z } from 'zod'

const VoidCashUpSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
})

// POST /api/cashup/[id]/void — void an old open session (manager only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only managers/admins can void sessions
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Only managers can void cash-up sessions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = VoidCashUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const updated = await runWithRequestTenant(req, () => voidCashUp(params.id, session.user.id, parsed.data.reason))
    return NextResponse.json({ cashUp: updated })
  } catch (err) {
    const message = 'Failed to void cash-up'
    logger.error({ err, cashUpId: params.id }, 'POST /api/cashup/[id]/void failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
