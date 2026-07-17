import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { unlockAccount } from '@/lib/services/authService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => unlockAccount(params.id, session.user.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'POST unlock failed')
    return NextResponse.json({ error: 'Failed to unlock account' }, { status: 500 })
  }
}
