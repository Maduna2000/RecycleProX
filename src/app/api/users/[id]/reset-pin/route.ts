import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { resetPinToDefault } from '@/lib/services/authService'
import logger from '@/lib/logger'

// POST /api/users/[id]/reset-pin
// Manager/admin resets a user's PIN back to the system default.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — manager or admin required' }, { status: 403 })
  }

  try {
    await resetPinToDefault(params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err, userId: params.id }, 'POST reset-pin failed')
    return NextResponse.json({ error: 'Failed to reset PIN' }, { status: 500 })
  }
}
