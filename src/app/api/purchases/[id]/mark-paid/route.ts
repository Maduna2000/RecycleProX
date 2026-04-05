import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import { z } from 'zod'

const Schema = z.object({
  paymentMethod: z.enum(['cash', 'eft', 'cheque']).default('cash'),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: params.id } })
    if (purchase.status !== 'pending') {
      return NextResponse.json({ error: `Purchase is already "${purchase.status}"` }, { status: 409 })
    }

    const updated = await prisma.purchase.update({
      where: { id: params.id },
      data: {
        status:        'completed',
        paymentMethod: parsed.data.paymentMethod,
      },
    })
    logger.info({ purchaseId: params.id, userId: session.user.id }, 'Unpaid purchase marked as paid')
    return NextResponse.json(updated)
  } catch (err) {
    logger.error({ err }, 'PATCH /api/purchases/[id]/mark-paid failed')
    return NextResponse.json({ error: 'Failed to mark purchase as paid' }, { status: 500 })
  }
}
