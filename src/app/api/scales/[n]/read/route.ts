import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import {
  readScale,
  ScaleNotConfiguredError,
  ScaleTimeoutError,
} from '@/lib/scales/scaleService'

/**
 * GET /api/scales/[n]/read
 * Reads the current live weight from scale n (1, 2 or 3).
 * Any authenticated role may call this (cashier needs it on the purchase form).
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

  try {
    const weight = await readScale(n as 1 | 2 | 3)
    return NextResponse.json({ weight: weight.toString(), unit: 'kg', scaleNumber: n })
  } catch (err) {
    if (err instanceof ScaleNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof ScaleTimeoutError) {
      logger.warn({ scaleNumber: n }, 'Scale read timeout')
      return NextResponse.json({ error: 'Scale not responding' }, { status: 503 })
    }
    logger.error({ err, scaleNumber: n }, 'Scale read failed')
    return NextResponse.json({ error: 'Scale read failed' }, { status: 500 })
  }
}
