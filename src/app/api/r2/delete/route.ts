import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { deleteR2Object } from '@/lib/r2'

const Schema = z.object({ key: z.string().min(1) })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Only managers can delete photos
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'key required' }, { status: 422 })

  try {
    await deleteR2Object(parsed.data.key)
    logger.info({ key: parsed.data.key, userId: session.user.id }, 'r2.object.deleted')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'POST /api/r2/delete failed')
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
