import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getViewUrl } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key parameter required' }, { status: 400 })

  try {
    const url = await getViewUrl(key)
    return NextResponse.json({ url })
  } catch (err) {
    logger.error({ err, key }, 'GET /api/r2/view-url failed')
    return NextResponse.json({ error: 'Failed to generate view URL' }, { status: 500 })
  }
}
