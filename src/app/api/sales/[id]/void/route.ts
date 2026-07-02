import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidSaleSchema } from '@/lib/schemas/sale'
import { voidSale, SaleNotFoundError, SaleAlreadyVoidedError } from '@/lib/services/saleService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can void sales' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = VoidSaleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const sale = await voidSale(params.id, parsed.data, session.user.id)
    return NextResponse.json(sale)
  } catch (err) {
    if (err instanceof SaleNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof SaleAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 409 })

    const message = err instanceof Error ? err.message : 'Failed to void sale'
    logger.error({ err }, 'POST /api/sales/[id]/void failed')

    // If the error message contains "approved", return a 409 Conflict instead of 500
    if (message.includes('approved')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
