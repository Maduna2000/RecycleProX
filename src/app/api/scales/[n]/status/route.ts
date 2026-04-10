import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isScaleConnected } from '@/lib/scales/scaleService'

/**
 * GET /api/scales/[n]/status
 * Returns whether scale n is reachable (2-second probe).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { n: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const n = parseInt(params.n, 10)
  if (![1, 2, 3].includes(n)) {
    return NextResponse.json({ error: 'Scale number must be 1, 2 or 3' }, { status: 400 })
  }

  const connected = await isScaleConnected(n as 1 | 2 | 3)
  return NextResponse.json({ connected, scaleNumber: n })
}
