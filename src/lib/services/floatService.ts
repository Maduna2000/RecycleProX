import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import type { SetFloatInput } from '@/lib/schemas/float'
import type { FloatMovementType } from '@prisma/client'
import { withSerializableRetry } from '@/lib/db/withSerializableRetry'
import { sastDateLabelToUTCDate, normalizeToDateLabel, getDayBoundsSAST, todaySASTDate } from '@/lib/utils/dayBounds'

export class FloatMovementLockedError extends Error {
  code = 'CASHUP_LOCKED' as const
  constructor(message: string) { super(message); this.name = 'FloatMovementLockedError' }
}

export async function setFloat(data: SetFloatInput, userId: string) {
  const floatDate = sastDateLabelToUTCDate(data.floatDate)

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
  return prisma.cashFloat.findUnique({ where: { floatDate: todaySASTDate() } })
}

export async function getFloatForDate(date: Date) {
  return prisma.cashFloat.findUnique({ where: { floatDate: normalizeToDateLabel(date) } })
}

export async function listFloats(limit = 30) {
  const floats = await prisma.cashFloat.findMany({
    orderBy: { floatDate: 'desc' },
    take: limit,
    include: { movements: { select: { movementType: true, amount: true } } },
  })

  return floats.map((f, index) => {
    const opening = new Decimal(f.openingAmount.toString())
    const topUps = f.movements
      .filter((m) => m.movementType === 'top_up')
      .reduce((acc, m) => acc.plus(m.amount.toString()), new Decimal(0))
    const withdrawals = f.movements
      .filter((m) => m.movementType === 'withdrawal' || m.movementType === 'adjustment')
      .reduce((acc, m) => acc.plus(m.amount.toString()), new Decimal(0))

    const currentBalance = f.closingAmount
      ? new Decimal(f.closingAmount.toString())
      : opening.plus(topUps).minus(withdrawals)

    return {
      id: f.id,
      floatDate: f.floatDate,
      openingAmount: f.openingAmount.toString(),
      closingAmount: f.closingAmount?.toString() ?? null,
      currentBalance: currentBalance.toFixed(2),
      notes: f.notes,
      createdByUserId: f.createdByUserId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      isLastEntry: index === 0,
    }
  })
}

/**
 * Returns the most recent CashFloat record strictly before the given date.
 * Used to carry forward the previous day's closing amount when no float is
 * manually set for today.
 */
export async function getMostRecentFloatBefore(date: Date) {
  const d = normalizeToDateLabel(date)

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
  const d = normalizeToDateLabel(date)

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

// ─── Sum of top-up movements for a given date ────────────────────────────────

export async function getFloatTopUpsForDate(date: Date): Promise<Decimal> {
  const { start, end } = getDayBoundsSAST(date)

  const result = await prisma.floatMovement.aggregate({
    _sum: { amount: true },
    where: { movementType: 'top_up', createdAt: { gte: start, lte: end } },
  })
  return new Decimal(result._sum.amount?.toString() ?? '0')
}

/**
 * Total "drawings received" for a date = only mid-day top-up movements.
 *
 * The CashFloat.openingAmount is NOT included because it represents the
 * drawer starting cash, which is already accounted for in CashUp.openingBalance
 * (carried forward from previous day's closing).
 *
 * Drawings received = additional cash injected INTO the drawer during the day.
 */
export async function getDrawingsReceivedForDate(date: Date): Promise<Decimal> {
  const { start, end } = getDayBoundsSAST(date)

  const topUpsResult = await prisma.floatMovement.aggregate({
    _sum: { amount: true },
    where: { movementType: 'top_up', createdAt: { gte: start, lte: end } },
  })

  return new Decimal(topUpsResult._sum.amount?.toString() ?? '0')
}

// ─── Get current float with balance and movements ─────────────────────────────

export async function getCurrentFloat() {
  const today = todaySASTDate()

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
  const today = todaySASTDate()

  // Once today's cash-up has been submitted, its drawingsReceived figure is
  // frozen — a movement added after that point would never be reflected in any
  // reconciliation. Block it rather than silently lose track of the cash.
  const todaysCashUp = await prisma.cashUp.findUnique({
    where: { sessionDate: today },
    select: { status: true },
  })
  if (todaysCashUp && (todaysCashUp.status === 'submitted' || todaysCashUp.status === 'approved')) {
    throw new FloatMovementLockedError(
      "Today's cash-up has already been submitted — this cannot be added until tomorrow's session opens"
    )
  }

  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    // Ensure a float record exists for today
    let floatRecord = await tx.cashFloat.findUnique({ where: { floatDate: today } })
    if (!floatRecord) {
      const prev = await tx.cashFloat.findFirst({ where: { floatDate: { lt: today } }, orderBy: { floatDate: 'desc' } })
      const opening = prev?.closingAmount ?? prev?.openingAmount ?? new Decimal(0)
      floatRecord = await tx.cashFloat.create({
        data: { floatDate: today, openingAmount: new Decimal(opening.toString()), createdByUserId },
      })
    }

    // Compute current balance from last movement's balanceAfter
    const lastMovement = await tx.floatMovement.findFirst({
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

    const movement = await tx.floatMovement.create({
      data: { cashFloatId: floatRecord.id, movementType, amount: moveAmount, balanceAfter, referenceNote, createdByUserId },
    })

    logger.info({ cashFloatId: floatRecord.id, movementType, amount, balanceAfter: balanceAfter.toFixed(2), createdByUserId }, 'float.movement.added')
    return { movement, balanceAfter: balanceAfter.toFixed(2) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }))
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

// ─── Reverse Float Movement ─────────────────────────────────────────────────────

export class FloatMovementReversalError extends Error {
  code: 'NOT_FOUND' | 'NOT_LAST_MOVEMENT'
  constructor(code: 'NOT_FOUND' | 'NOT_LAST_MOVEMENT', message: string) {
    super(message)
    this.name = 'FloatMovementReversalError'
    this.code = code
  }
}

/**
 * Reverse (delete) a float movement. Only allowed if it's the most recent movement
 * for that float record.
 */
export async function reverseFloatMovement(
  movementId: string,
  userId: string
): Promise<{ reversedMovementId: string }> {
  const movement = await prisma.floatMovement.findUnique({
    where: { id: movementId },
    include: { cashFloat: true },
  })

  if (!movement) {
    throw new FloatMovementReversalError('NOT_FOUND', 'Movement not found')
  }

  // Check if this is the last movement for this float
  const newerMovement = await prisma.floatMovement.findFirst({
    where: {
      cashFloatId: movement.cashFloatId,
      createdAt: { gt: movement.createdAt },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (newerMovement) {
    throw new FloatMovementReversalError(
      'NOT_LAST_MOVEMENT',
      'Can only reverse the most recent movement'
    )
  }

  // Delete the movement
  await prisma.floatMovement.delete({ where: { id: movementId } })

  logger.info(
    {
      movementId,
      cashFloatId: movement.cashFloatId,
      movementType: movement.movementType,
      amount: movement.amount.toString(),
      reversedByUserId: userId,
    },
    'float.movement.reversed'
  )

  return { reversedMovementId: movementId }
}

// ─── Float Reversal ────────────────────────────────────────────────────────────

export type FloatReversalErrorCode =
  | 'NOT_FOUND'
  | 'NOT_LAST_ENTRY'
  | 'HAS_PURCHASES'
  | 'HAS_SALES'
  | 'HAS_CASHUP'

export class FloatReversalError extends Error {
  code: FloatReversalErrorCode
  constructor(code: FloatReversalErrorCode, message: string) {
    super(message)
    this.name = 'FloatReversalError'
    this.code = code
  }
}

/**
 * Pre-flight check to determine if a float can be reversed.
 * Returns canReverse: true only if all safety checks pass.
 */
export async function canReverseFloat(floatId: string): Promise<{
  canReverse: boolean
  reason?: string
  isLastEntry: boolean
}> {
  const floatRecord = await prisma.cashFloat.findUnique({
    where: { id: floatId },
    include: { movements: true },
  })

  if (!floatRecord) {
    return { canReverse: false, reason: 'Float not found', isLastEntry: false }
  }

  const floatDate = floatRecord.floatDate
  const { start: startOfDay, end: endOfDay } = getDayBoundsSAST(floatDate)

  // Check if this is the last entry
  const newerFloat = await prisma.cashFloat.findFirst({
    where: { floatDate: { gt: floatDate } },
    orderBy: { floatDate: 'asc' },
  })

  if (newerFloat) {
    return { canReverse: false, reason: 'Not the most recent float entry', isLastEntry: false }
  }

  // Check for purchases on this date
  const purchaseCount = await prisma.purchase.count({
    where: {
      createdAt: { gte: startOfDay, lte: endOfDay },
      status: { not: 'voided' },
    },
  })

  if (purchaseCount > 0) {
    return { canReverse: false, reason: `${purchaseCount} purchase(s) exist for this date`, isLastEntry: true }
  }

  // Check for sales on this date
  const saleCount = await prisma.sale.count({
    where: {
      createdAt: { gte: startOfDay, lte: endOfDay },
      status: { not: 'voided' },
    },
  })

  if (saleCount > 0) {
    return { canReverse: false, reason: `${saleCount} sale(s) exist for this date`, isLastEntry: true }
  }

  // Check for cashup on this date (voided sessions are inert and don't block)
  const cashUpCount = await prisma.cashUp.count({
    where: { sessionDate: floatDate, status: { not: 'voided' } },
  })

  if (cashUpCount > 0) {
    return { canReverse: false, reason: 'Cash-up exists for this date', isLastEntry: true }
  }

  // Top-ups and withdrawals are part of the float - they cascade delete with the float
  // Only purchases, sales, and cashup should block reversal

  return { canReverse: true, isLastEntry: true }
}

/**
 * Reverse (delete) a float entry. Only allowed if:
 * - Float exists
 * - Is the most recent (last) float entry
 * - No purchases on that date
 * - No sales on that date
 * - No cashup for that date
 * - No non-opening movements (top-ups, withdrawals, adjustments)
 */
export async function reverseFloat(
  floatId: string,
  userId: string,
  reason?: string
): Promise<{ reversedFloatId: string; reversedDate: Date }> {
  return prisma.$transaction(async (tx) => {
    // 1. Fetch the float record
    const floatRecord = await tx.cashFloat.findUnique({
      where: { id: floatId },
      include: { movements: true },
    })

    if (!floatRecord) {
      throw new FloatReversalError('NOT_FOUND', 'Float record not found')
    }

    const floatDate = floatRecord.floatDate
    const { start: startOfDay, end: endOfDay } = getDayBoundsSAST(floatDate)

    // 2. Verify this is the LAST (most recent) float entry
    const newerFloat = await tx.cashFloat.findFirst({
      where: { floatDate: { gt: floatDate } },
      orderBy: { floatDate: 'asc' },
    })

    if (newerFloat) {
      throw new FloatReversalError(
        'NOT_LAST_ENTRY',
        `Cannot reverse: newer float exists for ${newerFloat.floatDate.toISOString().split('T')[0]}`
      )
    }

    // 3. Check for purchases on this date
    const purchaseCount = await tx.purchase.count({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
        status: { not: 'voided' },
      },
    })

    if (purchaseCount > 0) {
      throw new FloatReversalError('HAS_PURCHASES', `Cannot reverse: ${purchaseCount} purchase(s) exist for this date`)
    }

    // 4. Check for sales on this date
    const saleCount = await tx.sale.count({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
        status: { not: 'voided' },
      },
    })

    if (saleCount > 0) {
      throw new FloatReversalError('HAS_SALES', `Cannot reverse: ${saleCount} sale(s) exist for this date`)
    }

    // 5. Check for cashup on this date (voided sessions are inert and don't block)
    const cashUpCount = await tx.cashUp.count({
      where: { sessionDate: floatDate, status: { not: 'voided' } },
    })

    if (cashUpCount > 0) {
      throw new FloatReversalError('HAS_CASHUP', 'Cannot reverse: cash-up session exists for this date')
    }

    // 6. All checks passed - delete the float record (cascade deletes movements)
    // Note: Top-ups/withdrawals are part of the float and cascade delete automatically
    await tx.cashFloat.delete({ where: { id: floatId } })

    // 8. Log the reversal action
    logger.info(
      {
        floatId,
        floatDate: floatDate.toISOString(),
        reversedByUserId: userId,
        reason,
      },
      'float.reversed'
    )

    return {
      reversedFloatId: floatId,
      reversedDate: floatDate,
    }
  })
}
