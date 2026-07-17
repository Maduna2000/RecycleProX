import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { resetPassword } from '@/lib/services/authService'
import { ResetPasswordSchema } from '@/lib/schemas/auth'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = ResetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await runWithRequestTenant(req, () => resetPassword(params.id, parsed.data.newPassword, session.user.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'POST /api/users/[id]/reset-password failed')
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}
