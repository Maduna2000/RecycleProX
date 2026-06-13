import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidStocktakeSchema } from '@/lib/schemas/stocktake'
import { voidStocktake } from '@/lib/services/stocktakeService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can void stocktakes' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = VoidStocktakeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 })
  }

  try {
    const stocktake = await voidStocktake(params.id, session.user.id, parsed.data.reason)
    return NextResponse.json(stocktake)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to void stocktake'
    if (msg.includes('not found') || msg.includes('Not found')) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    if (msg.includes('already voided')) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    logger.error({ err, id: params.id }, 'POST /api/stocktake/[id]/void failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
