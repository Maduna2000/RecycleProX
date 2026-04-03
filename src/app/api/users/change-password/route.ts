import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { changePassword } from '@/lib/services/authService'
import { ChangePasswordSchema } from '@/lib/schemas/auth'
import logger from '@/lib/logger'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await changePassword(session.user.id, parsed.data.currentPassword, parsed.data.newPassword)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'POST change-password failed')
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
