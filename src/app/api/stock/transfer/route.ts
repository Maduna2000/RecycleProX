import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import Decimal from 'decimal.js'
import { stockTransfer, ProductNotFoundError } from '@/lib/services/stockService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const TransferSchema = z.object({
  sourceProductId: z.string().uuid(),
  destProductId:   z.string().uuid(),
  quantity: z
    .string()
    .min(1)
    .refine((v) => new Decimal(v).gt(0), { message: 'Quantity must be positive' }),
  notes: z.string().max(300).optional(),
})

// POST /api/stock/transfer
// Moves quantity from one product's stock to another in a single transaction.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can transfer stock' }, { status: 403 })
  }

  const body   = await req.json().catch(() => ({}))
  const parsed = TransferSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await runWithRequestTenant(req, () => stockTransfer({ ...parsed.data, createdByUserId: session.user.id }))
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error({ err }, 'POST /api/stock/transfer failed')
    return NextResponse.json({ error: 'Failed to transfer stock' }, { status: 500 })
  }
}
