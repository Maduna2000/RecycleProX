import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { setPin } from '@/lib/services/authService'
import { SetPinSchema } from '@/lib/schemas/auth'
import logger from '@/lib/logger'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = SetPinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await setPin(session.user.id, parsed.data.pin)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'POST set-pin failed')
    return NextResponse.json({ error: 'Failed to set PIN' }, { status: 500 })
  }
}
