import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTodayFloat } from '@/lib/services/floatService'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const record = await getTodayFloat()
  return NextResponse.json(record ?? null)
}
