import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import type { SetFloatInput } from '@/lib/schemas/float'
import type { FloatMovementType } from '@prisma/client'

export async function setFloat(data: SetFloatInput, userId: string) {
  const floatDate = new Date(data.floatDate)
  floatDate.setHours(0, 0, 0, 0)

  const record = await prisma.cashFloat.upsert({
    where: { floatDate },
    create: {
      floatDate,
      openingAmount:   new Decimal(data.openingAmount),
      notes:           data.notes,
      createdByUserId: userId,
    },
    update: {
      openingAmount: new Decimal(data.openingAmount),
      notes:         data.notes,
    },
  })
  logger.info({ floatId: record.id, floatDate: data.floatDate, userId }, 'CashFloat set')
  return record
}

export async function getTodayFloat() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return prisma.cashFloat.findUnique({ where: { floatDate: today } })
}

export async function getFloatForDate(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return prisma.cashFloat.findUnique({ where: { floatDate: d } })
}

export async function listFloats(limit = 30) {
  return prisma.cashFloat.findMany({
    orderBy: { floatDate: 'desc' },
    take: limit,
  })
}

/**
 * Returns the most recent CashFloat record strictly before the given date.
 * Used to carry forward the previous day's closing amount when no float is
 * manually set for today.
 */
export async function getMostRecentFloatBefore(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  return prisma.cashFloat.findFirst({
    where: { floatDate: { lt: d } },
    orderBy: { floatDate: 'desc' },
  })
}

/**
 * Write the closing amount on the CashFloat record for the given date.
 * Called by cashUpService.approveCashUp to record the declared cash as the closing balance.
 * Creates the record if it doesn't exist (e.g. no manual float was set that day) so the
 * carry-forward chain is never broken.
 */
export async function updateClosingAmount(date: Date, amount: Decimal) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  const existing = await prisma.cashFloat.findUnique({ where: { floatDate: d } })
  if (existing) {
    await prisma.cashFloat.update({ where: { floatDate: d }, data: { closingAmount: amount } })
  } else {
    const prev = await getMostRecentFloatBefore(d)
    const opening = new Decimal((prev?.closingAmount ?? prev?.openingAmount ?? 0).toString())
    await prisma.cashFloat.create({
      data: { floatDate: d, openingAmount: opening, closingAmount: amount },
    })
  }
  logger.info({ floatDate: d.toISOString(), closingAmount: amount.toFixed(2) }, 'CashFloat closing amount updated')
}

// ─── Sum of top-up movements for a given date (used by cashup formula) ───────

export async function getFloatTopUpsForDate(date: Date): Promise<Decimal> {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end   = new Date(date); end.setHours(23, 59, 59, 999)

  const result = await prisma.floatMovement.aggregate({
    _sum: { amount: true },
    where: { movementType: 'top_up', createdAt: { gte: start, lte: end } },
  })
  return new Decimal(result._sum.amount?.toString() ?? '0')
}

// ─── Get current float with balance and movements ─────────────────────────────

export async function getCurrentFloat() {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const record = await prisma.cashFloat.findUnique({
    where:   { floatDate: today },
    include: { movements: { orderBy: { createdAt: 'asc' } } },
  })

  if (!record) return null

  // Current balance = balanceAfter of last movement, or openingAmount if no movements
  const lastMovement = record.movements.at(-1)
  const currentBalance = lastMovement
    ? new Decimal(lastMovement.balanceAfter.toString())
    : new Decimal(record.openingAmount.toString())

  return { ...record, currentBalance: currentBalance.toFixed(2) }
}

// ─── Add a float movement (top-up or withdrawal) ──────────────────────────────

export async function addFloatMovement(
  movementType: FloatMovementType,
  amount: string,
  referenceNote: string | undefined,
  createdByUserId: string
) {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Ensure a float record exists for today
  let floatRecord = await prisma.cashFloat.findUnique({ where: { floatDate: today } })
  if (!floatRecord) {
    const prev = await getMostRecentFloatBefore(today)
    const opening = prev?.closingAmount ?? prev?.openingAmount ?? new Decimal(0)
    floatRecord = await prisma.cashFloat.create({
      data: { floatDate: today, openingAmount: new Decimal(opening.toString()), createdByUserId },
    })
  }

  // Compute current balance from last movement's balanceAfter
  const lastMovement = await prisma.floatMovement.findFirst({
    where:   { cashFloatId: floatRecord.id },
    orderBy: { createdAt: 'desc' },
  })
  const currentBalance = lastMovement
    ? new Decimal(lastMovement.balanceAfter.toString())
    : new Decimal(floatRecord.openingAmount.toString())

  const moveAmount = new Decimal(amount)
  const balanceAfter = movementType === 'top_up' || movementType === 'opening'
    ? currentBalance.plus(moveAmount)
    : currentBalance.minus(moveAmount)   // withdrawal / adjustment

  if (balanceAfter.isNegative()) {
    throw new Error(`Withdrawal of ${amount} would exceed float balance of ${currentBalance.toFixed(2)}`)
  }

  const movement = await prisma.floatMovement.create({
    data: { cashFloatId: floatRecord.id, movementType, amount: moveAmount, balanceAfter, referenceNote, createdByUserId },
  })

  logger.info({ cashFloatId: floatRecord.id, movementType, amount, balanceAfter: balanceAfter.toFixed(2), createdByUserId }, 'float.movement.added')
  return { movement, balanceAfter: balanceAfter.toFixed(2) }
}

// ─── List float movements (with pagination) ───────────────────────────────────

export async function listFloatMovements(opts?: {
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}) {
  const page     = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50

  const where = {
    ...((opts?.from || opts?.to) && {
      createdAt: {
        ...(opts?.from && { gte: opts.from }),
        ...(opts?.to   && { lte: opts.to }),
      },
    }),
  }

  const [movements, total] = await Promise.all([
    prisma.floatMovement.findMany({
      where,
      include: { cashFloat: { select: { floatDate: true } } },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.floatMovement.count({ where }),
  ])

  return { movements, total, page, pageSize }
}
