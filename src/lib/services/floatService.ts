import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import type { SetFloatInput } from '@/lib/schemas/float'
import { withSerializableRetry } from '@/lib/db/withSerializableRetry'
import { postFloatMovement, reverseFloatMovementLedger } from '@/lib/services/ledgerService'

// Mirrors the FloatMovementType enum in prisma/schema.prisma. Defined locally
// rather than imported from @prisma/client because that enum becomes a
// plain `string` on the SQLite-generated client (SQLite's Prisma connector
// has no enum support — see scripts/generate-sqlite-schema.ts), so the type
// itself isn't stable across the two clients this codebase compiles against.
type FloatMovementType = 'opening' | 'top_up' | 'withdrawal' | 'adjustment'
import { sastDateLabelToUTCDate, normalizeToDateLabel, getDayBoundsSAST, todaySASTDate } from '@/lib/utils/dayBounds'
import type { DateWindow } from '@/lib/services/cashUpWindow'

export class FloatMovementLockedError extends Error {
  code = 'CASHUP_LOCKED' as const
  constructor(message: string) { super(message); this.name = 'FloatMovementLockedError' }
}

export async function setFloat(data: SetFloatInput, userId: string) {
  const tenantId = requireTenantId()
  const floatDate = sastDateLabelToUTCDate(data.floatDate)

  const record = await prisma.cashFloat.upsert({
    where: { tenantId_floatDate: { tenantId, floatDate } },
    create: {
      tenantId,
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
  return prisma.cashFloat.findUnique({ where: { tenantId_floatDate: { tenantId: requireTenantId(), floatDate: todaySASTDate() } } })
}

export async function getFloatForDate(date: Date) {
  return prisma.cashFloat.findUnique({ where: { tenantId_floatDate: { tenantId: requireTenantId(), floatDate: normalizeToDateLabel(date) } } })
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

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Returns the most recent CashFloat record strictly before the given date.
 * Used to carry forward the previous day's closing amount when no float is
 * manually set for today. Accepts an optional tx client so callers (e.g.
 * cashUpService.approveCashUp) can run this as part of their own transaction.
 *
 * Only correct for bootstrapping a record that doesn't exist yet for `date`
 * (there's nothing "today" to prefer over "before"). To find the most
 * recent record carrying forward INTO a session opening on `date` itself
 * (where a same-day CashFloat row may already carry a fresher
 * closingAmount from an earlier same-day approval), use
 * getMostRecentFloatAsOf instead.
 */
export async function getMostRecentFloatBefore(date: Date, tx: TxClient | typeof prisma = prisma) {
  const d = normalizeToDateLabel(date)

  return tx.cashFloat.findFirst({
    where: { floatDate: { lt: d } },
    orderBy: { floatDate: 'desc' },
  })
}

/**
 * Like getMostRecentFloatBefore, but includes `date` itself. A day can now
 * hold more than one CashUp session (separate shifts) sharing a single
 * CashFloat row for that day — approving an earlier session today writes
 * its declaredCash onto TODAY's own CashFloat.closingAmount
 * (updateClosingAmount), so opening a later same-day session must be able
 * to see that same-day row, not just a prior day's.
 */
export async function getMostRecentFloatAsOf(date: Date, tx: TxClient | typeof prisma = prisma) {
  const d = normalizeToDateLabel(date)

  return tx.cashFloat.findFirst({
    where: { floatDate: { lte: d } },
    orderBy: { floatDate: 'desc' },
  })
}

/**
 * Write the closing amount on the CashFloat record for the given date.
 * Called by cashUpService.approveCashUp to record the declared cash as the closing balance.
 * Creates the record if it doesn't exist (e.g. no manual float was set that day) so the
 * carry-forward chain is never broken. Accepts an optional tx client so the caller can
 * make this write atomic with its own (e.g. the CashUp status update it happens alongside).
 */
export async function updateClosingAmount(date: Date, amount: Decimal, tx: TxClient | typeof prisma = prisma) {
  const tenantId = requireTenantId()
  const d = normalizeToDateLabel(date)

  const existing = await tx.cashFloat.findUnique({ where: { tenantId_floatDate: { tenantId, floatDate: d } } })
  if (existing) {
    await tx.cashFloat.update({ where: { tenantId_floatDate: { tenantId, floatDate: d } }, data: { closingAmount: amount } })
  } else {
    const prev = await getMostRecentFloatBefore(d, tx)
    const opening = new Decimal((prev?.closingAmount ?? prev?.openingAmount ?? 0).toString())
    await tx.cashFloat.create({
      data: { tenantId, floatDate: d, openingAmount: opening, closingAmount: amount },
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
export async function getDrawingsReceivedForDate(window: DateWindow): Promise<Decimal> {
  const topUpsResult = await prisma.floatMovement.aggregate({
    _sum: { amount: true },
    where: { movementType: 'top_up', createdAt: { gte: window.start, lte: window.end } },
  })

  return new Decimal(topUpsResult._sum.amount?.toString() ?? '0')
}

/**
 * The true current float balance: whichever is more recent between the last
 * recorded float movement's balanceAfter and the most recently APPROVED
 * cash-up session's declaredCash.
 *
 * A movement-chain balance alone goes stale the moment a cash-up gets
 * approved after it — approval is a real physical cash count, and a whole
 * session's worth of purchases/sales/payments/expenses happened between the
 * movement and the approval that the float ledger itself never tracks. The
 * declared cash from a later approval must override the movement chain;
 * only movements strictly after that approval should still layer on top of
 * it (chronological order via createdAt vs approvedAt, not a same-day check
 * — a same-day-only comparison would miss a movement that landed just after
 * local midnight but before the previous day's session was approved, the
 * same SAST/UTC boundary case getSessionWindow's own start-of-window
 * handling already has to account for).
 *
 * "Most recent" approval means most recent BUSINESS session (sessionDate,
 * then openedAt as same-day tiebreaker) — never `orderBy: approvedAt desc`.
 * Approval is a manual click that can happen late: a session opened and
 * approved on day N can sit unapproved and only get approved on day N+2,
 * after a day-N+1 session has already been opened and approved. Ordering by
 * approvedAt would then surface the stale day-N approval as "latest" and
 * clobber day-N+1's already-correct closing balance with day-N's older,
 * lower figure (confirmed against real data: a 2-day-late approval of an
 * older session inflated the next float's opening balance by the difference
 * between the two declaredCash amounts).
 */
async function resolveCurrentFloatBalance(
  tenantId: string,
  fallback: { closingAmount: { toString(): string } | null; openingAmount: { toString(): string } },
  lastMovement: { balanceAfter: { toString(): string }; createdAt: Date } | null,
  tx: TxClient | typeof prisma
): Promise<Decimal> {
  const lastApproval = await tx.cashUp.findFirst({
    where:   { tenantId, status: 'approved', declaredCash: { not: null } },
    orderBy: [{ sessionDate: 'desc' }, { openedAt: 'desc' }],
  })

  if (lastApproval?.approvedAt && lastApproval.declaredCash &&
      (!lastMovement || lastApproval.approvedAt > lastMovement.createdAt)) {
    return new Decimal(lastApproval.declaredCash.toString())
  }
  if (lastMovement) {
    return new Decimal(lastMovement.balanceAfter.toString())
  }
  return new Decimal((fallback.closingAmount ?? fallback.openingAmount).toString())
}

// ─── Get current float with balance and movements ─────────────────────────────

export async function getCurrentFloat() {
  const tenantId = requireTenantId()
  const today = todaySASTDate()

  const record = await prisma.cashFloat.findUnique({
    where:   { tenantId_floatDate: { tenantId, floatDate: today } },
    include: { movements: { orderBy: { createdAt: 'asc' } } },
  })

  if (!record) return null

  const lastMovement = record.movements.at(-1) ?? null
  const currentBalance = await resolveCurrentFloatBalance(tenantId, record, lastMovement, prisma)

  return { ...record, currentBalance: currentBalance.toFixed(2) }
}

// ─── Add a float movement (top-up or withdrawal) ──────────────────────────────

export async function addFloatMovement(
  movementType: FloatMovementType,
  amount: string,
  referenceNote: string | undefined,
  createdByUserId: string
) {
  const tenantId = requireTenantId()
  const today = todaySASTDate()

  // Once today's latest cash-up session has been submitted, its
  // drawingsReceived figure is frozen — a movement added after that point
  // would never be reflected in any reconciliation. Block it rather than
  // silently lose track of the cash; opening a new session (a second shift)
  // unblocks this again, since that new session's window picks up right
  // where the submitted one left off. A day can have more than one session
  // now (see cashUpWindow.ts), so this must look at the most recent one for
  // today, not assume there's only ever one.
  const todaysCashUp = await prisma.cashUp.findFirst({
    where:   { sessionDate: today },
    orderBy: { openedAt: 'desc' },
    select:  { status: true },
  })
  if (todaysCashUp && (todaysCashUp.status === 'submitted' || todaysCashUp.status === 'approved')) {
    throw new FloatMovementLockedError(
      "This session's cash-up has already been submitted — open a new session (e.g. for the next shift) before adding more float"
    )
  }

  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    // Ensure a float record exists for today
    let floatRecord = await tx.cashFloat.findUnique({ where: { tenantId_floatDate: { tenantId, floatDate: today } } })
    if (!floatRecord) {
      const prev = await tx.cashFloat.findFirst({ where: { floatDate: { lt: today } }, orderBy: { floatDate: 'desc' } })
      const opening = prev?.closingAmount ?? prev?.openingAmount ?? new Decimal(0)
      floatRecord = await tx.cashFloat.create({
        data: { tenantId, floatDate: today, openingAmount: new Decimal(opening.toString()), createdByUserId },
      })
    }

    const lastMovement = await tx.floatMovement.findFirst({
      where:   { cashFloatId: floatRecord.id },
      orderBy: { createdAt: 'desc' },
    })
    const currentBalance = await resolveCurrentFloatBalance(tenantId, floatRecord, lastMovement, tx)

    const moveAmount = new Decimal(amount)
    const balanceAfter = movementType === 'top_up' || movementType === 'opening'
      ? currentBalance.plus(moveAmount)
      : currentBalance.minus(moveAmount)   // withdrawal / adjustment

    if (balanceAfter.isNegative()) {
      throw new Error(`Withdrawal of ${amount} would exceed float balance of ${currentBalance.toFixed(2)}`)
    }

    const movement = await tx.floatMovement.create({
      data: { tenantId, cashFloatId: floatRecord.id, movementType, amount: moveAmount, balanceAfter, referenceNote, createdByUserId },
    })

    // 'opening' isn't a cash-affecting event from outside the tracked
    // system — see postFloatMovement's own comment — so nothing posts for it.
    if (movementType === 'top_up' || movementType === 'withdrawal' || movementType === 'adjustment') {
      await postFloatMovement(tx, {
        floatMovementId: movement.id,
        entryDate: movement.createdAt,
        movementType,
        amount: moveAmount,
        note: referenceNote,
        userId: createdByUserId,
      })
    }

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
  userId: string,
  reason: string
): Promise<{ reversedMovementId: string }> {
  const movement = await prisma.floatMovement.findUnique({
    where: { id: movementId },
    include: { cashFloat: true },
  })

  if (!movement) {
    throw new FloatMovementReversalError('NOT_FOUND', 'Movement not found')
  }

  // Same lock addFloatMovement already enforces on the way in — once the
  // movement's own day has a submitted/approved cash-up, its
  // drawingsReceived figure is frozen, so deleting a movement baked into
  // that total would silently invalidate the reconciliation with nothing
  // recalculated afterward. Scoped to the movement's own floatDate (not
  // hardcoded "today") so reversing a stale prior-day movement is judged
  // against the cash-up for that day, not whatever day it happens to be now.
  const floatDayCashUp = await prisma.cashUp.findFirst({
    where:   { sessionDate: movement.cashFloat.floatDate },
    orderBy: { openedAt: 'desc' },
    select:  { status: true },
  })
  if (floatDayCashUp && (floatDayCashUp.status === 'submitted' || floatDayCashUp.status === 'approved')) {
    throw new FloatMovementLockedError(
      "That day's cash-up has already been submitted — this movement can no longer be reversed"
    )
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

  // Delete the movement — but the ledger itself never deletes an entry
  // (same convention as every other void/reverse path in this codebase);
  // it gets a mirror-image reversing entry instead, inside the same
  // transaction as the delete.
  await prisma.$transaction(async (tx) => {
    if (movement.movementType === 'top_up' || movement.movementType === 'withdrawal' || movement.movementType === 'adjustment') {
      await reverseFloatMovementLedger(tx, movementId, reason, userId)
    }
    await tx.floatMovement.delete({ where: { id: movementId } })
  })

  logger.info(
    {
      movementId,
      cashFloatId: movement.cashFloatId,
      movementType: movement.movementType,
      amount: movement.amount.toString(),
      reversedByUserId: userId,
      reason,
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

    // 6. All checks passed - delete the float record (cascade deletes movements).
    // The cascade only deletes the FloatMovement rows themselves — it has no
    // idea any of them posted to the ledger, so each one's entry needs its
    // own explicit reversal first (same "never delete a ledger entry, mirror
    // it instead" rule as everywhere else).
    for (const m of floatRecord.movements) {
      if (m.movementType === 'top_up' || m.movementType === 'withdrawal' || m.movementType === 'adjustment') {
        await reverseFloatMovementLedger(tx, m.id, reason ?? 'float reversed', userId)
      }
    }
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
