import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { setFloat, listFloats, canReverseFloat } from '@/lib/services/floatService'
import { SetFloatSchema } from '@/lib/schemas/float'
import logger from '@/lib/logger'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const floats = await listFloats(30)

  // Only compute canReverse for the last entry (index 0) - others cannot be reversed
  const floatsWithCanReverse = await Promise.all(
    floats.map(async (f, index) => {
      if (index === 0 && f.isLastEntry) {
        const { canReverse } = await canReverseFloat(f.id)
        return { ...f, canReverse }
      }
      return { ...f, canReverse: false }
    })
  )

  return NextResponse.json(floatsWithCanReverse)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = SetFloatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const record = await setFloat(parsed.data, session.user.id)
    return NextResponse.json(record)
  } catch (err) {
    logger.error({ err }, 'POST /api/float failed')
    return NextResponse.json({ error: 'Failed to set float' }, { status: 500 })
  }
}
