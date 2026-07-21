import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { setPin } from '@/lib/services/authService'
import { SetPinSchema } from '@/lib/schemas/auth'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

// POST /api/users/[id]/set-pin
// Admin sets ANY user's personal PIN directly (unlike /api/users/set-pin,
// which is self-service and always targets the caller's own account).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin required' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = SetPinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await runWithRequestTenant(req, () => setPin(params.id, parsed.data.pin))
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err, userId: params.id }, 'POST /api/users/[id]/set-pin failed')
    return NextResponse.json({ error: 'Failed to set PIN' }, { status: 500 })
  }
}
