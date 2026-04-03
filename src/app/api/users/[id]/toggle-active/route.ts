import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { toggleActive } from '@/lib/services/authService'
import logger from '@/lib/logger'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (session.user.id === params.id) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
  }

  try {
    const user = await toggleActive(params.id, session.user.id)
    return NextResponse.json(user)
  } catch (err) {
    logger.error({ err }, 'POST toggle-active failed')
    return NextResponse.json({ error: 'Failed to toggle active status' }, { status: 500 })
  }
}
