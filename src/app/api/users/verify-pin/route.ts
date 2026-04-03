import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPin } from '@/lib/services/authService'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { pin } = await req.json()
  const valid = await verifyPin(session.user.id, pin)
  if (!valid) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  return NextResponse.json({ success: true })
}
