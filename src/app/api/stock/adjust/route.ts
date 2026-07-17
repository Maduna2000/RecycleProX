import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { manualAdjustment, ProductNotFoundError } from '@/lib/services/stockService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const AdjustSchema = z.object({
  productId: z.string().uuid(),
  direction: z.enum(['in', 'out']),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/, 'Invalid quantity')
    .refine((v) => parseFloat(v) > 0, 'Quantity must be > 0'),
  notes: z.string().min(3, 'Notes required for manual adjustments'),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can adjust stock' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = AdjustSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const movement = await runWithRequestTenant(req, () => manualAdjustment({ ...parsed.data, createdByUserId: session.user.id }))
    return NextResponse.json(movement, { status: 201 })
  } catch (err) {
    if (err instanceof ProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'POST /api/stock/adjust failed')
    return NextResponse.json({ error: 'Failed to record adjustment' }, { status: 500 })
  }
}
