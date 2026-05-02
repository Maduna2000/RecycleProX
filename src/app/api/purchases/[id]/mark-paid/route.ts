import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import { z } from 'zod'
import Decimal from 'decimal.js'

const SettleSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount (e.g. 150.00)')
    .refine((v) => new Decimal(v).gte(new Decimal('0.01')), {
      message: 'Minimum payment amount is E0.01',
    }),
  paymentMethod: z.enum(['cash', 'eft', 'cheque', 'amplopay']).default('cash'),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = SettleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: params.id } })

    if (purchase.status !== 'pending') {
      return NextResponse.json(
        { error: `Purchase is already "${purchase.status}" and cannot be settled` },
        { status: 409 },
      )
    }

    const totalAmount   = new Decimal(purchase.totalAmount.toString())
    const loanDeduction = purchase.loanDeductionAmount
      ? new Decimal(purchase.loanDeductionAmount.toString())
      : new Decimal(0)
    const currentPaid   = new Decimal(purchase.amountPaid.toString())
    const outstanding   = totalAmount.minus(loanDeduction).minus(currentPaid)
    const settleAmount  = new Decimal(parsed.data.amount)

    if (settleAmount.greaterThan(outstanding)) {
      return NextResponse.json(
        { error: `Payment amount (R ${settleAmount.toFixed(2)}) exceeds remaining balance (R ${outstanding.toFixed(2)})` },
        { status: 422 },
      )
    }

    const isFullySettled = currentPaid.plus(settleAmount).gte(totalAmount.minus(loanDeduction))

    const updated = await prisma.purchase.update({
      where: { id: params.id },
      data: {
        amountPaid:    { increment: settleAmount },
        paymentMethod: parsed.data.paymentMethod,
        ...(isFullySettled ? { status: 'completed' } : {}),
      },
    })

    logger.info(
      { purchaseId: params.id, userId: session.user.id, settleAmount: settleAmount.toFixed(2), isFullySettled },
      'purchase.payment.recorded',
    )
    return NextResponse.json(updated)
  } catch (err) {
    logger.error({ err }, 'PATCH /api/purchases/[id]/mark-paid failed')
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 })
  }
}
