import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import { SubmitCashUpInput, ApproveCashUpInput, type Currency } from '@/lib/schemas/cashup'
import { getMostRecentFloatAsOf, updateClosingAmount, getDrawingsReceivedForDate } from './floatService'
import { getExpenseTotalsForDate } from './expenseService'
import { getLoanTotalsForDate } from './loanService'
import { getSessionWindow, type DateWindow } from './cashUpWindow'
import { sastDateLabelToUTCDate, getDayBoundsSAST, todaySASTDateStr } from '@/lib/utils/dayBounds'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(dateStr: string): Date {
  return sastDateLabelToUTCDate(dateStr)
}

function todayStr(): string {
  return todaySASTDateStr()
}

// ─── Typed errors ──────────────────────────────────────────────────────────

export class CashUpNotSubmittedError extends Error {
  code = 'NOT_SUBMITTED' as const
  constructor(status: string) { super(`Cannot reject cash-up with status "${status}" — only submitted sessions can be rejected`); this.name = 'CashUpNotSubmittedError' }
}

export class CashUpNewerSessionOpenError extends Error {
  code = 'NEWER_SESSION_OPEN' as const
  constructor() { super('Cannot reject — a newer session already exists (open or submitted). Void this session instead if it cannot be corrected.'); this.name = 'CashUpNewerSessionOpenError' }
}

// ─── Open a cash-up session ───────────────────────────────────────────────────
// A day can hold more than one session (separate shifts) — the only real
// rule is that at most one session may be 'open' at a time, enforced here
// and backed by a partial unique DB index (see migration
// 20260724000000_cashup_multi_session_per_day) so a race between two opens
// can't slip both through.
export async function openCashUp(openedByUserId: string, sessionDateStr?: string, currency: Currency = 'ZAR') {
  const dateStr = sessionDateStr ?? todayStr()
  const sessionDate = toDate(dateStr)

  // Check if there's an open session from a previous day that needs to be submitted first
  const openFromPrevDay = await prisma.cashUp.findFirst({
    where: { sessionDate: { lt: sessionDate }, status: 'open' },
    orderBy: { sessionDate: 'desc' },
  })
  if (openFromPrevDay) {
    logger.warn({ existing: openFromPrevDay.id }, 'Cannot open new session — previous day session still open')
    throw new Error('You must submit the previous day\'s cash-up before opening a new session')
  }

  // Fetched up front so it's available both for the early "already open" return
  // below and for the opening-balance carry-forward logic further down. Uses
  // <= (not <) and a secondary openedAt sort so an earlier session on THIS
  // SAME day (a prior shift) counts as "the previous session" too, not just
  // sessions from earlier calendar days. Excludes voided sessions — a voided
  // session's declaredCash (if it had one before being voided) is not a real
  // carry-forward figure; keep looking further back instead.
  const prevCashUp = await prisma.cashUp.findFirst({
    where:   { sessionDate: { lte: sessionDate }, status: { not: 'voided' } },
    orderBy: [{ sessionDate: 'desc' }, { openedAt: 'desc' }],
  })

  // Only an already-OPEN session for today blocks opening a new one — a
  // submitted/approved/voided session from an earlier shift today must NOT
  // silently resurrect itself (that row can never be submitted again), it
  // should let a fresh session for the next shift be created instead.
  const existingOpen = await prisma.cashUp.findFirst({
    where: { sessionDate, status: 'open' },
  })

  if (existingOpen) {
    logger.warn({ existing: existingOpen.id }, 'Cash-up session already open for this date')
    return existingOpen
  }

  // Opening balance = PREVIOUS session's closing balance (the carry-forward).
  // prevCashUp's own state always takes priority when it exists: a session's
  // declaredCash is set the instant it's SUBMITTED, while CashFloat's
  // closingAmount only updates on APPROVAL (updateClosingAmount, called from
  // approveCashUp) — so the float record can never be fresher than
  // prevCashUp itself, only equal (once approved) or stale (still awaiting
  // approval). Checking the float record first, as this used to, meant a
  // submitted-but-not-yet-approved session's declared cash was silently
  // ignored in favour of whatever an EARLIER approval had left behind —
  // confirmed live: a session declaring R32,415.76 was followed by a new
  // session opening at R2,415.76 (the previous approval's stale closing),
  // simply because nothing had been approved since.
  // Priority:
  //   1. Previous cashup still submitted (not yet approved) — use declaredCash
  //   2. Previous cashup still open — calculate expected from live transactions
  //   3. Previous cashup has a declaredCash (the common case: approved)
  //   4. No cashup history at all — bootstrap from the float record
  let openingBalance: Decimal

  if (prevCashUp?.status === 'submitted' && prevCashUp.declaredCash) {
    openingBalance = new Decimal(prevCashUp.declaredCash.toString())
    logger.info(
      { prevDate: prevCashUp.sessionDate, amount: openingBalance.toFixed(2) },
      'CashUp: previous session submitted but not approved — using declared cash as opening balance'
    )
  } else if (prevCashUp?.status === 'open') {
    // Previous session still open — calculate expected from transactions
    const prevStats   = await getLiveStats(prevCashUp.sessionDate, prevCashUp)
    const prevOpen    = new Decimal(prevCashUp.openingBalance.toString())
    const prevDraw    = new Decimal(prevStats.floatTopUps)
    const calcClosing = prevOpen
      .plus(prevDraw)
      .plus(new Decimal(prevStats.cashSales))
      .minus(new Decimal(prevStats.cashPurchases))
      .minus(new Decimal(prevStats.cashPayments))
      .minus(new Decimal(prevStats.expenses))
      .minus(new Decimal(prevStats.loanAdvance))
      .plus(new Decimal(prevStats.loanRepayment))
    openingBalance = calcClosing.isNegative() ? new Decimal(0) : calcClosing
    logger.warn(
      { prevDate: prevCashUp.sessionDate, calcClosing: calcClosing.toFixed(2) },
      'CashUp: previous session still open — carrying forward calculated expected balance'
    )
  } else if (prevCashUp?.declaredCash) {
    openingBalance = new Decimal(prevCashUp.declaredCash.toString())
    logger.info(
      { prevDate: prevCashUp.sessionDate, amount: openingBalance.toFixed(2) },
      'CashUp: using previous cashup declared cash as opening balance'
    )
  } else {
    // Bootstrap: no usable CashUp history at all — fall back to the float record.
    const prevFloat = await getMostRecentFloatAsOf(sessionDate)
    if (prevFloat?.closingAmount) {
      openingBalance = new Decimal(prevFloat.closingAmount.toString())
      logger.info({ prevDate: prevFloat.floatDate, amount: openingBalance.toFixed(2) }, 'CashUp: bootstrap — using float closing amount (no cashup history)')
    } else if (prevFloat?.openingAmount) {
      openingBalance = new Decimal(prevFloat.openingAmount.toString())
      logger.info({ prevDate: prevFloat.floatDate, amount: openingBalance.toFixed(2) }, 'CashUp: bootstrap — carrying forward float opening (no cashup history)')
    } else {
      openingBalance = new Decimal(0)
    }
  }

  let cashUp
  try {
    cashUp = await prisma.cashUp.create({
      data: {
        tenantId: requireTenantId(),
        sessionDate,
        currency,
        openedByUserId,
        status: 'open',
        openingBalance: openingBalance,
      },
    })
  } catch (err: unknown) {
    // Two concurrent requests can both pass the "existingOpen" check above
    // before either commits; the partial unique index on (tenantId) WHERE
    // status='open' is the real guard. If we lose the race, just return
    // whatever the winner created instead of erroring.
    if ((err as { code?: string })?.code === 'P2002') {
      const winner = await prisma.cashUp.findFirst({ where: { status: 'open' }, orderBy: { openedAt: 'desc' } })
      if (winner) {
        logger.warn({ sessionDate: dateStr }, 'CashUp: lost create race — returning existing open session')
        return winner
      }
    }
    throw err
  }

  logger.info({ cashUpId: cashUp.id, sessionDate: dateStr }, 'Cash-up session opened')
  return cashUp
}

// ─── Preview the opening balance a new session would get ─────────────────────
// Read-only mirror of openCashUp's own carry-forward logic — creates
// nothing. Exists so the client can cache "what would opening a session look
// like right now" while online, and use it to safely offer a PROVISIONAL
// offline session open later, without guessing. Two of openCashUp's four
// fallback tiers are simple stored values (float.closingAmount,
// cashUp.declaredCash, float.openingAmount) and are safe to reuse from a
// stale cache; the "previous session still open, calculate from live
// transactions" tier is NOT — it depends on aggregating purchases/sales/
// payments/etc since that session opened, which is exactly what an offline
// client can't safely reproduce. safeOpeningBalance is only set for the
// safe tiers; its absence (with canOpen: true) means the balance can only be
// determined online, even though opening itself isn't blocked.
export interface OpeningBalancePreview {
  canOpen: boolean
  reason?: string
  safeOpeningBalance?: string
}

export async function previewOpeningBalance(sessionDateStr?: string): Promise<OpeningBalancePreview> {
  const dateStr = sessionDateStr ?? todayStr()
  const sessionDate = toDate(dateStr)

  const openFromPrevDay = await prisma.cashUp.findFirst({
    where: { sessionDate: { lt: sessionDate }, status: 'open' },
    orderBy: { sessionDate: 'desc' },
  })
  if (openFromPrevDay) {
    return { canOpen: false, reason: 'A previous day\'s session is still open and must be submitted first' }
  }

  const existingOpen = await prisma.cashUp.findFirst({ where: { sessionDate, status: 'open' } })
  if (existingOpen) {
    return { canOpen: false, reason: 'A session is already open for this date' }
  }

  // Mirrors openCashUp's own priority exactly — see its comment for why
  // prevCashUp's own state must be checked before the float record.
  const prevCashUp = await prisma.cashUp.findFirst({
    where:   { sessionDate: { lte: sessionDate }, status: { not: 'voided' } },
    orderBy: [{ sessionDate: 'desc' }, { openedAt: 'desc' }],
  })

  if (prevCashUp?.status === 'submitted' && prevCashUp.declaredCash) {
    return { canOpen: true, safeOpeningBalance: new Decimal(prevCashUp.declaredCash.toString()).toFixed(2) }
  }
  if (prevCashUp?.status === 'open') {
    return { canOpen: true, reason: 'Opening balance depends on live totals from the still-open previous session' }
  }
  if (prevCashUp?.declaredCash) {
    return { canOpen: true, safeOpeningBalance: new Decimal(prevCashUp.declaredCash.toString()).toFixed(2) }
  }

  const prevFloat = await getMostRecentFloatAsOf(sessionDate)
  if (prevFloat?.closingAmount) {
    return { canOpen: true, safeOpeningBalance: new Decimal(prevFloat.closingAmount.toString()).toFixed(2) }
  }
  if (prevFloat?.openingAmount) {
    return { canOpen: true, safeOpeningBalance: new Decimal(prevFloat.openingAmount.toString()).toFixed(2) }
  }
  return { canOpen: true, safeOpeningBalance: '0.00' }
}

// ─── Get the open/submitted session for today (or a specific date) ───────────
export async function getOpenSession(sessionDateStr?: string) {
  const dateStr = sessionDateStr ?? todayStr()
  const sessionDate = toDate(dateStr)

  return prisma.cashUp.findFirst({
    where: { sessionDate, status: { in: ['open', 'submitted'] } },
    orderBy: { openedAt: 'desc' },
  })
}

// ─── Get any open session (regardless of date) ────────────────────────────────
// Used to check if there's an unsubmitted session from a previous day
export async function getAnyOpenSession() {
  return prisma.cashUp.findFirst({
    where: { status: 'open' },
    orderBy: { sessionDate: 'desc' },
  })
}

// ─── Get all open sessions ────────────────────────────────────────────────────
// Returns all sessions that are still 'open' (not submitted), ordered by date
export async function getAllOpenSessions() {
  return prisma.cashUp.findMany({
    where: { status: 'open' },
    orderBy: { sessionDate: 'desc' },
  })
}

// ─── Void/cancel a session ─────────────────────────────────────────────────────
// Used to clean up sessions that can't be reconciled at all (e.g., too old, or
// data lost). Allowed from 'open' (stale, never submitted) or 'submitted'
// (genuinely unreconcilable, as opposed to rejectCashUp which sends it back to
// the cashier for correction). Terminal — once voided, this date is closed for good.
export async function voidCashUp(cashUpId: string, voidedByUserId: string, reason: string) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (!['open', 'submitted'].includes(cashUp.status)) {
    throw new Error(`Cannot void cash-up with status "${cashUp.status}"`)
  }

  const updated = await prisma.cashUp.update({
    where: { id: cashUpId },
    data: {
      status: 'voided',
      notes: `VOIDED: ${reason}`,
      closedByUserId: voidedByUserId,
      closedAt: new Date(),
    },
  })

  logger.warn({ cashUpId, voidedByUserId, reason }, 'Cash-up session voided')
  return updated
}

// ─── Reject a submitted session (send back to cashier for correction) ────────
// Unlike voidCashUp, this reopens the session rather than terminating it — for
// cases like a fat-fingered declared-cash entry where the day should still be
// reconciled, just recounted. Blocked if any other session is already open —
// reopening this one to 'open' would otherwise leave two open sessions at
// once, which the partial unique DB index (see cashUpWindow.ts) would reject
// anyway; this check just gives a clearer error first.
export async function rejectCashUp(cashUpId: string, rejectedByUserId: string, reason: string) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (cashUp.status !== 'submitted') {
    throw new CashUpNotSubmittedError(cashUp.status)
  }

  // Two distinct reasons a "newer session" can block this:
  // (1) rejecting flips this session's status to 'open', and the partial
  //     unique DB index allows only one 'open' session tenant-wide — a
  //     different-day open session would collide with that.
  // (2) a later SAME-DAY session (any status but voided) depends on this
  //     session's closedAt as its own reconciliation window's start
  //     boundary (getSessionWindow, cashUpWindow.ts) — rejecting clears
  //     closedAt to null, which would silently widen that later session's
  //     window back to midnight the next time it's recomputed (its own
  //     live stats while still open, or recalculateApprovedCashUpForDate
  //     after a later void), double-counting this session's entire
  //     transaction history into it.
  const [otherOpen, laterSameDay] = await Promise.all([
    prisma.cashUp.findFirst({ where: { status: 'open', id: { not: cashUpId } } }),
    prisma.cashUp.findFirst({
      where: { sessionDate: cashUp.sessionDate, openedAt: { gt: cashUp.openedAt }, status: { not: 'voided' } },
    }),
  ])
  if (otherOpen || laterSameDay) {
    throw new CashUpNewerSessionOpenError()
  }

  const updated = await prisma.cashUp.update({
    where: { id: cashUpId },
    data: {
      status: 'open',
      // Clear closedAt/closedByUserId along with the status flip — a
      // non-null closedAt is what getSessionWindow (cashUpWindow.ts) reads
      // as "this session's reconciliation window ends here". Left in place,
      // a rejected-then-resubmitted session's window would stop at the
      // original (pre-rejection) submission instant, silently dropping
      // every transaction the cashier enters while fixing the correction.
      closedAt:        null,
      closedByUserId:  null,
      rejectedByUserId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  })

  logger.warn({ cashUpId, rejectedByUserId, reason }, 'Cash-up rejected — returned to cashier')
  return updated
}

// ─── Calculate system totals for a session's window ──────────────────────────
// Sums completed transactions within a session's own reconciliation window
// (see cashUpWindow.ts) — not the whole calendar day, since a day can now
// hold more than one session (separate shifts).
async function calcSystemTotals(window: DateWindow, drawingsReceived = new Decimal(0), loansTotal = new Decimal(0)) {
  const { start, end } = window

  const [salesCashAgg, salesEftAgg, purchasesAgg, paymentsAgg, saleSettlementsAgg] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      // payments: { none: {} } — mirrors purchasesAgg below: a sale settled
      // via markSalePaid/processSaleSplitPayment gets its cash inflow
      // captured by a linked Payment row (folded into cashSales via
      // saleSettlementsAgg) — counting its totalAmount here too would
      // double it.
      where: { paymentMethod: 'cash', status: 'completed', payments: { none: {} }, createdAt: { gte: start, lte: end } },
    }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: { in: ['eft', 'cheque'] }, status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      // payments: { none: {} } — a purchase settled via markPurchasePaid/
      // processSplitPayment gets its cash outflow captured by a linked
      // Payment row instead (see systemCashPayments below); counting its
      // totalAmount here too would double the same cash movement.
      where: { paymentMethod: 'cash', status: 'completed', payments: { none: {} }, createdAt: { gte: start, lte: end } },
    }),
    // source: 'purchase' only — money paid OUT to settle a purchase. A
    // source: 'sale' Payment (money paid IN by a buyer settling a sale) is
    // the opposite direction and must never be pooled into the same
    // subtracted bucket — see saleSettlementsAgg below, which is instead
    // added into cashSales.
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentMethod: 'cash', voidedAt: null, source: 'purchase', createdAt: { gte: start, lte: end } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentMethod: 'cash', voidedAt: null, source: 'sale', createdAt: { gte: start, lte: end } },
    }),
  ])

  const cardPayments    = new Decimal(salesEftAgg._sum.totalAmount?.toString() ?? '0')
  const cashPurchases   = new Decimal(purchasesAgg._sum.totalAmount?.toString() ?? '0')
  const cashPayments    = new Decimal(paymentsAgg._sum.amount?.toString() ?? '0')
  // A sale created pending then later settled in cash (markSalePaid /
  // processSaleSplitPayment) is a real cash inflow — fold it into cashSales
  // rather than the (outflow-only) cashPayments bucket.
  const cashSales       = new Decimal(salesCashAgg._sum.totalAmount?.toString() ?? '0')
    .plus(saleSettlementsAgg._sum.amount?.toString() ?? '0')
  const expensesTotal   = await getExpenseTotalsForDate(window)

  // Expected in drawer = opening + drawings + cash sales - cash purchases - cash payments - expenses - loan advances + loan repayments
  // "Drawings Received" = additional cash injected into drawer by management (positive, like RecyclePro X).
  // openingBalance is stored on the cashUp record; here we return the variable components only.
  const cashExpected = cashSales.minus(cashPurchases).minus(cashPayments).minus(expensesTotal).plus(drawingsReceived).plus(loansTotal)

  return { cashSales, cashPurchases, cashPayments, cashExpected, cardPayments, expensesTotal }
}

// ─── Cash-up lock check ───────────────────────────────────────────────────────
// Once a day's cash-up is approved, its books are closed — void/reverse-payment
// must refuse to touch any transaction dated that day, full stop. No override.
// Any approved session for the date is enough to lock it (a day can hold more
// than one session for separate shifts; matching one is treated the same as
// matching all — this is a hard block, not a precise per-shift boundary).
export async function isSessionDateApproved(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionDate: Date
): Promise<boolean> {
  const count = await tx.cashUp.count({ where: { sessionDate, status: 'approved' } })
  return count > 0
}

// ─── Recalculate an approved cash-up after a completed sale/purchase is voided ──
// Called from inside voidSale's/voidPurchase's own transaction — the sale or
// purchase status change and this correction commit together, never one
// without the other. Only the specific component(s) that changed are
// re-aggregated; everything else on the cash-up (expenses, drawings, card
// payments) is left untouched since voiding one sale or purchase doesn't
// affect those. declaredCash is never touched — it's the cashier's physical
// count from that day, a historical fact, not a derived figure. No-op if
// there's no approved session covering the voided transaction (voidSale/
// voidPurchase only call this once they've confirmed one exists).
//
// transactionCreatedAt is the voided sale/purchase's own createdAt — needed
// to pick the right session when a day has more than one approved session
// (separate shifts), since sessionDate alone no longer identifies a single
// row.
//
// 'payments' means purchase-direction settlement Payments (systemCashPayments
// / "Account Payments") — voiding a settled purchase needs this whenever its
// Payment gets cascade-voided. A settled SALE's Payment is instead folded
// into cashSales (see calcSystemTotals), so recalculating 'sales' already
// covers that case; there's no separate sale-payments bucket to recalc here.
export async function recalculateApprovedCashUpForDate(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionDate: Date,
  transactionCreatedAt: Date,
  changed: Array<'sales' | 'purchases' | 'payments' | 'loans'>
) {
  const approvedToday = await tx.cashUp.findMany({
    where:   { sessionDate, status: 'approved' },
    orderBy: { openedAt: 'asc' },
  })
  if (approvedToday.length === 0) return

  let cashUp = approvedToday[0]!
  if (approvedToday.length > 1) {
    cashUp = await findSessionForInstant(tx, approvedToday, transactionCreatedAt)
  }

  const window = await getSessionWindow(tx, cashUp)
  const { start, end } = window

  const openingBalance   = new Decimal(cashUp.openingBalance.toString())
  const declaredCash     = new Decimal(cashUp.declaredCash?.toString() ?? '0')
  const expensesTotal    = new Decimal(cashUp.expensesTotal.toString())
  const drawingsReceived = new Decimal(cashUp.drawingsReceived.toString())

  let cashSales     = new Decimal(cashUp.systemCashSales.toString())
  let cashPurchases = new Decimal(cashUp.systemCashPurchases.toString())
  let cashPayments  = new Decimal(cashUp.systemCashPayments.toString())
  let loansTotal    = new Decimal(cashUp.loansTotal.toString())

  if (changed.includes('sales')) {
    const [directAgg, settledAgg] = await Promise.all([
      tx.sale.aggregate({
        _sum: { totalAmount: true },
        // See calcSystemTotals — excludes sales settled via a Payment record.
        where: { paymentMethod: 'cash', status: 'completed', payments: { none: {} }, createdAt: { gte: start, lte: end } },
      }),
      tx.payment.aggregate({
        _sum: { amount: true },
        where: { paymentMethod: 'cash', voidedAt: null, source: 'sale', createdAt: { gte: start, lte: end } },
      }),
    ])
    cashSales = new Decimal(directAgg._sum.totalAmount?.toString() ?? '0')
      .plus(settledAgg._sum.amount?.toString() ?? '0')
  }

  if (changed.includes('purchases')) {
    const agg = await tx.purchase.aggregate({
      _sum: { totalAmount: true },
      // See calcSystemTotals — excludes purchases settled via a Payment record.
      where: { paymentMethod: 'cash', status: 'completed', payments: { none: {} }, createdAt: { gte: start, lte: end } },
    })
    cashPurchases = new Decimal(agg._sum.totalAmount?.toString() ?? '0')
  }

  if (changed.includes('payments')) {
    const agg = await tx.payment.aggregate({
      _sum: { amount: true },
      where: { paymentMethod: 'cash', voidedAt: null, source: 'purchase', createdAt: { gte: start, lte: end } },
    })
    cashPayments = new Decimal(agg._sum.amount?.toString() ?? '0')
  }

  if (changed.includes('loans')) {
    const loanTotals = await getLoanTotalsForDate({ start, end })
    loansTotal = new Decimal(loanTotals.repaid).minus(loanTotals.advanced)
  }

  const cashExpected = cashSales.minus(cashPurchases).minus(cashPayments).minus(expensesTotal).plus(drawingsReceived).plus(loansTotal)
  const fullExpected = openingBalance.plus(cashExpected)
  const variance = declaredCash.minus(fullExpected)

  await tx.cashUp.update({
    where: { id: cashUp.id },
    data: {
      systemCashSales:     cashSales,
      systemCashPurchases: cashPurchases,
      systemCashPayments:  cashPayments,
      loansTotal,
      systemCashExpected:  fullExpected,
      variance,
    },
  })

  logger.warn(
    { cashUpId: cashUp.id, sessionDate, changed, newVariance: variance.toFixed(2) },
    'cashup.recalculated_after_void'
  )

  await repropagateFinPeriodCumulative(tx, sessionDate, { cashUpId: cashUp.id, variance })
}

// ─── Re-propagate finPeriodCumulative from a given date forward ──────────────
// Recomputes every approved session's finPeriodCumulative, in true
// chronological order (sessionDate, then openedAt to break ties within a
// day) — each is a running sum of approved variance, so any change to one
// session's variance, or a session newly becoming approved, shifts every
// later approved session's total too. Two callers:
//   - recalculateApprovedCashUpForDate, after a void changes an already-
//     approved session's variance
//   - approveCashUp, because approving inserts a session into the approved
//     timeline — if sessions are approved out of chronological order (an
//     earlier-dated session approved after a later-dated one already was),
//     every later session's stored cumulative was computed without this
//     session's variance and needs correcting now that it counts
// `override`, if given, treats that one session's variance as the supplied
// value rather than trusting what's already stored for it — needed by
// recalculateApprovedCashUpForDate, which computes a fresh variance in the
// same transaction as this call.
async function repropagateFinPeriodCumulative(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  fromDate: Date,
  override?: { cashUpId: string; variance: Decimal }
) {
  const priorApproved = await tx.cashUp.aggregate({
    where: { status: 'approved', sessionDate: { lt: fromDate } },
    _sum: { variance: true },
  })
  let running = new Decimal(priorApproved._sum.variance?.toString() ?? '0')

  const fromThisDateOnward = await tx.cashUp.findMany({
    where:   { status: 'approved', sessionDate: { gte: fromDate } },
    orderBy: [{ sessionDate: 'asc' }, { openedAt: 'asc' }],
  })

  for (const c of fromThisDateOnward) {
    const v = override && c.id === override.cashUpId ? override.variance : new Decimal(c.variance?.toString() ?? '0')
    running = running.plus(v)
    await tx.cashUp.update({ where: { id: c.id }, data: { finPeriodCumulative: running } })
  }
}

// Picks which of a day's several approved sessions a transaction actually
// belongs to, by finding the one whose reconciliation window contains its
// createdAt. Falls back to the earliest session if none match (shouldn't
// happen — every instant in a day belongs to exactly one session's window —
// but a transaction predating the first session, e.g. a backfilled record,
// needs somewhere safe to land rather than being silently dropped).
async function findSessionForInstant<T extends { sessionDate: Date; openedAt: Date; closedAt: Date | null }>(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessions: T[],
  instant: Date
): Promise<T> {
  for (const s of sessions) {
    const window = await getSessionWindow(tx, s)
    if (instant >= window.start && instant < window.end) return s
  }
  return sessions[0]!
}

// ─── Submit (cashier declares cash) ──────────────────────────────────────────
export async function submitCashUp(
  cashUpId: string,
  closedByUserId: string,
  input: SubmitCashUpInput
) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (cashUp.status !== 'open') {
    throw new Error(`Cannot submit cash-up with status "${cashUp.status}"`)
  }

  // Scoped to this session's own reconciliation window, not the whole
  // calendar day — a day can hold more than one session (separate shifts).
  const window = await getSessionWindow(prisma, cashUp)

  // Both drawingsReceived and loansTotal are fully server-derived — never from user input.
  // drawingsReceived = only mid-day top-ups (FloatMovements), NOT the opening float.
  const drawingsReceived = await getDrawingsReceivedForDate(window)
  const loanTotals = await getLoanTotalsForDate(window)
  // netCashOut is positive = cash went out as advances (reduces drawer), so we subtract it
  const loansTotal = new Decimal(loanTotals.netCashOut).negated()
  const totals = await calcSystemTotals(window, drawingsReceived, loansTotal)

  const openingBalance = new Decimal(cashUp.openingBalance.toString())
  const declared  = new Decimal(input.declaredCash)
  // Full expected = opening + operational net
  const fullExpected = openingBalance.plus(totals.cashExpected)
  const variance = declared.minus(fullExpected)

  // Cumulative variance = sum of all previously approved cash-up variances + this one
  const priorApproved = await prisma.cashUp.aggregate({
    where: { status: 'approved' },
    _sum: { variance: true },
  })
  const priorCumulative = new Decimal(priorApproved._sum.variance?.toString() ?? '0')
  const finPeriodCumulative = priorCumulative.plus(variance)

  const updated = await prisma.cashUp.update({
    where: { id: cashUpId },
    data: {
      status:              'submitted',
      closedByUserId,
      closedAt:            new Date(),
      systemCashSales:     totals.cashSales,
      systemCashPurchases: totals.cashPurchases,
      systemCashPayments:  totals.cashPayments,
      systemCashExpected:  fullExpected,
      expensesTotal:       totals.expensesTotal,
      cardPaymentsTotal:   totals.cardPayments,
      drawingsReceived,
      loansTotal,
      declaredCash:        declared,
      variance,
      finPeriodCumulative,
      denominations:       input.denominations ?? {},
      notes:               input.notes ?? null,
    },
  })

  logger.info(
    { cashUpId, variance: variance.toFixed(2), userId: closedByUserId },
    'Cash-up submitted'
  )
  return updated
}

// ─── Approve (manager signs off) ─────────────────────────────────────────────
export async function approveCashUp(
  cashUpId: string,
  approvedByUserId: string,
  input: ApproveCashUpInput
) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (cashUp.status !== 'submitted') {
    throw new Error(`Cannot approve cash-up with status "${cashUp.status}"`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const approved = await tx.cashUp.update({
      where: { id: cashUpId },
      data: {
        status:          'approved',
        approvedByUserId,
        approvedAt:      new Date(),
        notes:           input.notes !== undefined ? input.notes : cashUp.notes,
      },
    })

    // Write declaredCash as closing amount on the float record for this day
    if (cashUp.declaredCash) {
      await updateClosingAmount(
        cashUp.sessionDate,
        new Decimal(cashUp.declaredCash.toString()),
        tx
      )
    }

    // Approving inserts this session into the approved-variance timeline —
    // if sessions have been approved out of chronological order, this
    // session's own finPeriodCumulative (computed back at submit time from
    // whatever was approved then) and every later-dated approved session's
    // cumulative can both be stale. Re-propagate from this session's date
    // forward so every affected total reflects reality now that this
    // session counts. No override needed — variance was already computed
    // and stored correctly back at submission.
    await repropagateFinPeriodCumulative(tx, cashUp.sessionDate)

    return approved
  })

  logger.info({ cashUpId, userId: approvedByUserId }, 'Cash-up approved')
  return updated
}

// ─── Live stats for the cash-up page ─────────────────────────────────────────
// Returns real-time transaction totals for a given session date.
// sessionContext, when given, scopes the transactional totals (sales,
// purchases, payments, loans, expenses, drawings) to that specific session's
// own reconciliation window rather than the whole calendar day — a day can
// hold more than one session (separate shifts). unpaidToday always stays
// day-bounded regardless, since "purchases still unpaid, created today" is a
// follow-up list, not a per-shift cash reconciliation figure. Without a
// sessionContext (no session open yet for this date), falls back to the
// whole day — used for the pre-open live preview on the cash-up page.
export async function getLiveStats(
  sessionDate: Date,
  sessionContext?: { openedAt: Date; closedAt: Date | null }
) {
  const { start: dayStart, end: dayEnd } = getDayBoundsSAST(sessionDate)
  const { start, end } = sessionContext
    ? await getSessionWindow(prisma, { sessionDate, ...sessionContext })
    : { start: dayStart, end: dayEnd }

  const [
    salesCashAgg,
    salesCardAgg,
    salesCardOnlyAgg,
    purchasesAgg,
    transferredPurchasesAgg,
    paymentsAgg,
    saleSettlementsAgg,
    loanTotals,
    expenses,
    unpaidTodayAgg,
    unpaidAllTimeAgg,
    approvedVariances,
    floatTopUpsAgg,
  ] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      // See calcSystemTotals — excludes sales settled via a Payment record
      // (folded into cashSales via saleSettlementsAgg below instead).
      where: { paymentMethod: 'cash', status: 'completed', payments: { none: {} }, createdAt: { gte: start, lte: end } },
    }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: { in: ['eft', 'cheque'] }, status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    // True card-swipe sales only — distinct from the EFT/cheque total above.
    // Kept separate (not persisted) so it can be shown alongside the "Card Sales"
    // report, which uses this same filter, without renaming the existing
    // cardPaymentsTotal column (which has always meant EFT+cheque).
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: 'card', status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      // See calcSystemTotals — excludes purchases settled via a Payment record.
      where: { paymentMethod: 'cash', status: 'completed', payments: { none: {} }, createdAt: { gte: start, lte: end } },
    }),
    // Transferred (EFT) purchases — matches the "Transferred Purchases" report's filter,
    // exposed here so that report button can be greyed out when there's nothing to show.
    // Deliberately NOT excluding purchases with a linked Payment (unlike the
    // cash-purchases aggregate above): that exclusion exists there to avoid
    // double-counting against systemCashPayments, which only ever sums
    // paymentMethod:'cash' Payments. An eft-settled purchase (created
    // pending, later paid via markPurchasePaid/processSplitPayment with an
    // eft Payment) is never counted by any cash-side bucket, so excluding it
    // here too made it invisible everywhere — money that genuinely left the
    // bank account, tracked nowhere.
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: 'eft', status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    // source: 'purchase' only — see calcSystemTotals for why a source:'sale'
    // payment (cash received, not paid out) must not be pooled in here.
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentMethod: 'cash', voidedAt: null, source: 'purchase', createdAt: { gte: start, lte: end } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentMethod: 'cash', voidedAt: null, source: 'sale', createdAt: { gte: start, lte: end } },
    }),
    getLoanTotalsForDate({ start, end }),
    getExpenseTotalsForDate({ start, end }),
    prisma.$queryRaw<{ total: string; count: bigint }[]>`
      SELECT COALESCE(SUM("totalAmount" - COALESCE("loanDeductionAmount", 0) - "amountPaid"), 0)::text AS total,
             COUNT(*)::bigint AS count
      FROM "Purchase"
      WHERE status = 'pending' AND "createdAt" >= ${dayStart} AND "createdAt" <= ${dayEnd}
    `,
    prisma.$queryRaw<{ total: string; count: bigint }[]>`
      SELECT COALESCE(SUM("totalAmount" - COALESCE("loanDeductionAmount", 0) - "amountPaid"), 0)::text AS total,
             COUNT(*)::bigint AS count
      FROM "Purchase"
      WHERE status = 'pending'
    `,
    prisma.cashUp.aggregate({
      _sum: { variance: true },
      where: { status: 'approved' },
    }),
    // Drawings Received = only mid-day top-ups (FloatMovements), NOT the CashFloat.openingAmount
    // CashFloat.openingAmount is the drawer starting cash which is already in CashUp.openingBalance
    prisma.floatMovement.aggregate({
      _sum: { amount: true },
      where: { movementType: 'top_up', createdAt: { gte: start, lte: end } },
    }),
  ])

  return {
    // A sale settled in cash after starting pending (markSalePaid /
    // processSaleSplitPayment) is a real cash inflow — folded in here
    // rather than the (outflow-only) cashPayments bucket below.
    cashSales:     new Decimal(salesCashAgg._sum.totalAmount?.toString()  ?? '0')
      .plus(saleSettlementsAgg._sum.amount?.toString() ?? '0').toFixed(2),
    cardSales:     new Decimal(salesCardAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    cardOnlySales: new Decimal(salesCardOnlyAgg._sum.totalAmount?.toString() ?? '0').toFixed(2),
    cashPurchases: new Decimal(purchasesAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    transferredPurchases: new Decimal(transferredPurchasesAgg._sum.totalAmount?.toString() ?? '0').toFixed(2),
    cashPayments:  new Decimal(paymentsAgg._sum.amount?.toString()        ?? '0').toFixed(2),
    expenses:      expenses.toFixed(2),
    loanAdvance:   loanTotals.advanced,
    loanRepayment: loanTotals.repaid,
    nonCashAdvanced: loanTotals.nonCashAdvanced,
    // Drawings received = only mid-day top-ups, not the float opening amount
    floatTopUps:   new Decimal(floatTopUpsAgg._sum.amount?.toString() ?? '0').toFixed(2),
    unpaidToday: {
      total: new Decimal(unpaidTodayAgg[0]?.total   ?? '0').toFixed(2),
      count: Number(unpaidTodayAgg[0]?.count   ?? 0),
    },
    unpaidAllTime: {
      total: new Decimal(unpaidAllTimeAgg[0]?.total ?? '0').toFixed(2),
      count: Number(unpaidAllTimeAgg[0]?.count ?? 0),
    },
    finPeriodCumulative: new Decimal(approvedVariances._sum.variance?.toString() ?? '0').toFixed(2),
  }
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getCashUp(id: string) {
  return prisma.cashUp.findUnique({ where: { id } })
}

// ─── List with pagination ─────────────────────────────────────────────────────
export async function listCashUps(opts: { skip?: number; take?: number } = {}) {
  const { skip = 0, take = 30 } = opts
  const [items, total] = await Promise.all([
    prisma.cashUp.findMany({
      skip,
      take,
      orderBy: { sessionDate: 'desc' },
    }),
    prisma.cashUp.count(),
  ])
  return { items, total }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DATA FUNCTIONS
// These functions fetch detailed records for PDF report generation
// ─────────────────────────────────────────────────────────────────────────────

export interface CashSaleRecord {
  refNumber: string
  createdAt: Date
  customerName: string | null
  description: string
  totalAmount: string
}

export async function getCashSalesForDate(window: DateWindow): Promise<CashSaleRecord[]> {
  const { start, end } = window

  const sales = await prisma.sale.findMany({
    where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      lines: { select: { product: { select: { name: true } }, quantity: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return sales.map(s => ({
    refNumber: s.refNumber,
    createdAt: s.createdAt,
    customerName: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : s.buyerName ?? null,
    description: s.lines.map((l: { product: { name: string }; quantity: unknown }) => `${l.product.name} x${l.quantity}`).join(', ') || 'N/A',
    totalAmount: new Decimal(s.totalAmount.toString()).toFixed(2),
  }))
}

export interface CashPurchaseRecord {
  refNumber: string
  createdAt: Date
  supplierName: string
  supplierId: string | null
  items: string
  totalAmount: string
}

export async function getCashPurchasesForDate(window: DateWindow): Promise<CashPurchaseRecord[]> {
  const { start, end } = window

  const purchases = await prisma.purchase.findMany({
    // See calcSystemTotals — excludes purchases settled via a Payment record
    // (already listed under Account Payments) so the report matches the total.
    where: { paymentMethod: 'cash', status: 'completed', payments: { none: {} }, createdAt: { gte: start, lte: end } },
    include: {
      customer: { select: { firstName: true, lastName: true, idNumber: true } },
      lines: { select: { product: { select: { name: true } }, quantity: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return purchases.map(p => ({
    refNumber: p.refNumber,
    createdAt: p.createdAt,
    supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
    supplierId: p.customer.idNumber,
    items: p.lines.map((l: { product: { name: string }; quantity: unknown }) => `${l.product.name} x${l.quantity}`).join(', ') || 'N/A',
    totalAmount: new Decimal(p.totalAmount.toString()).toFixed(2),
  }))
}

export interface AccountPaymentRecord {
  refNumber: string
  createdAt: Date
  customerName: string
  notes: string | null
  amount: string
}

export async function getAccountPaymentsForDate(window: DateWindow): Promise<AccountPaymentRecord[]> {
  const { start, end } = window

  // source: 'purchase' — "Account Payments" specifically means money paid
  // OUT to settle a purchase (see calcSystemTotals); a source:'sale'
  // payment (cash received) belongs in the Cash Sales report instead.
  const payments = await prisma.payment.findMany({
    where: { paymentMethod: 'cash', voidedAt: null, source: 'purchase', createdAt: { gte: start, lte: end } },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return payments.map(p => ({
    refNumber: p.refNumber,
    createdAt: p.createdAt,
    customerName: p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : 'Unknown',
    notes: p.notes,
    amount: new Decimal(p.amount.toString()).toFixed(2),
  }))
}

export interface ExpenseRecord {
  refNumber: string
  createdAt: Date
  typeName: string
  description: string | null
  paymentMethod: string
  amount: string
}

export async function getExpensesForDateReport(window: DateWindow): Promise<ExpenseRecord[]> {
  const { start, end } = window

  const expenses = await prisma.expense.findMany({
    where: {
      status: { in: ['pending', 'approved'] },
      createdAt: { gte: start, lte: end },
    },
    include: { expenseType: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return expenses.map(e => ({
    refNumber: e.refNumber,
    createdAt: e.createdAt,
    typeName: e.expenseType.name,
    description: e.description,
    paymentMethod: e.paymentMethod,
    amount: new Decimal(e.amount.toString()).toFixed(2),
  }))
}

export interface LoanAdvanceRecord {
  refNumber: string
  createdAt: Date
  customerName: string
  customerId: string | null
  principalAmount: string
}

export async function getLoanAdvancesForDate(window: DateWindow): Promise<LoanAdvanceRecord[]> {
  const { start, end } = window

  const loans = await prisma.loan.findMany({
    where: {
      status: { not: 'voided' },
      createdAt: { gte: start, lte: end },
    },
    include: { customer: { select: { firstName: true, lastName: true, idNumber: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return loans.map(l => ({
    refNumber: l.refNumber,
    createdAt: l.createdAt,
    customerName: `${l.customer.firstName} ${l.customer.lastName}`,
    customerId: l.customer.idNumber,
    principalAmount: new Decimal(l.principalAmount.toString()).toFixed(2),
  }))
}

export interface LoanRepaymentRecord {
  id: string
  createdAt: Date
  customerName: string
  loanRefNumber: string
  amount: string
}

export async function getLoanRepaymentsForDate(window: DateWindow): Promise<LoanRepaymentRecord[]> {
  const { start, end } = window

  const repayments = await prisma.loanRepayment.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: {
      loan: {
        select: {
          refNumber: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return repayments.map(r => ({
    id: r.id,
    createdAt: r.createdAt,
    customerName: `${r.loan.customer.firstName} ${r.loan.customer.lastName}`,
    loanRefNumber: r.loan.refNumber,
    amount: new Decimal(r.amount.toString()).toFixed(2),
  }))
}

export interface UnpaidPurchaseRecord {
  refNumber: string
  createdAt: Date
  supplierName: string
  totalAmount: string
  amountPaid: string
  balance: string
}

export async function getUnpaidPurchases(scope: 'today' | 'all', sessionDate?: Date): Promise<UnpaidPurchaseRecord[]> {
  const whereClause: { status: 'pending'; createdAt?: { gte: Date; lte: Date } } = { status: 'pending' }

  if (scope === 'today' && sessionDate) {
    const { start, end } = getDayBoundsSAST(sessionDate)
    whereClause.createdAt = { gte: start, lte: end }
  }

  const purchases = await prisma.purchase.findMany({
    where: whereClause,
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return purchases.map(p => {
    const total = new Decimal(p.totalAmount.toString())
    const loanDeduction = new Decimal(p.loanDeductionAmount?.toString() ?? '0')
    const paid = new Decimal(p.amountPaid.toString())
    const balance = total.minus(loanDeduction).minus(paid)
    return {
      refNumber: p.refNumber,
      createdAt: p.createdAt,
      supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
      totalAmount: total.toFixed(2),
      amountPaid: paid.plus(loanDeduction).toFixed(2),
      balance: balance.toFixed(2),
    }
  })
}

export interface CardSaleRecord {
  refNumber: string
  createdAt: Date
  customerName: string | null
  paymentMethod: string
  totalAmount: string
}

export async function getCardSalesForDate(window: DateWindow): Promise<CardSaleRecord[]> {
  const { start, end } = window

  const sales = await prisma.sale.findMany({
    where: { paymentMethod: 'card', status: 'completed', createdAt: { gte: start, lte: end } },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return sales.map(s => ({
    refNumber: s.refNumber,
    createdAt: s.createdAt,
    customerName: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : s.buyerName ?? null,
    paymentMethod: s.paymentMethod,
    totalAmount: new Decimal(s.totalAmount.toString()).toFixed(2),
  }))
}

export interface TransferredPurchaseRecord {
  refNumber: string
  createdAt: Date
  supplierName: string
  bankRef: string | null
  totalAmount: string
}

export async function getTransferredPurchasesForDate(window: DateWindow): Promise<TransferredPurchaseRecord[]> {
  const { start, end } = window

  const purchases = await prisma.purchase.findMany({
    // Deliberately NOT excluding Payment-linked purchases — see the matching
    // comment on getLiveStats' transferredPurchasesAgg. An eft-settled
    // purchase is never counted by any cash-side bucket, so it must be
    // captured here instead, not dropped.
    where: { paymentMethod: 'eft', status: 'completed', createdAt: { gte: start, lte: end } },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return purchases.map(p => ({
    refNumber: p.refNumber,
    createdAt: p.createdAt,
    supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
    bankRef: p.notes,
    totalAmount: new Decimal(p.totalAmount.toString()).toFixed(2),
  }))
}

export interface DrawingsReceivedRecord {
  id: string
  createdAt: Date
  movementType: string
  notes: string | null
  amount: string
}

export async function getDrawingsReceivedForDateReport(window: DateWindow): Promise<DrawingsReceivedRecord[]> {
  const { start, end } = window

  // Drawings Received = only mid-day top-ups (additional cash injected during the session)
  // CashFloat.openingAmount is NOT included because it's the starting cash,
  // which is already represented in CashUp.openingBalance
  const topUps = await prisma.floatMovement.findMany({
    where: {
      movementType: 'top_up',
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: 'asc' },
  })

  return topUps.map(t => ({
    id: t.id,
    createdAt: t.createdAt,
    movementType: 'Top-Up',
    notes: t.referenceNote,
    amount: new Decimal(t.amount.toString()).toFixed(2),
  }))
}

export interface CashUpHistoryRecord {
  id: string
  sessionDate: Date
  status: string
  currency: string
  variance: string | null
  openingBalance: string
  declaredCash: string | null
  submittedAt: Date | null
  approvedAt: Date | null
}

export async function getCashUpHistory(opts: {
  skip?: number
  take?: number
  status?: string[]
} = {}): Promise<{ items: CashUpHistoryRecord[]; total: number }> {
  const { skip = 0, take = 50, status = ['submitted', 'approved'] } = opts

  const whereClause = { status: { in: status as ('submitted' | 'approved')[] } }

  const [items, total] = await Promise.all([
    prisma.cashUp.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { sessionDate: 'desc' },
    }),
    prisma.cashUp.count({ where: whereClause }),
  ])

  return {
    items: items.map(c => ({
      id: c.id,
      sessionDate: c.sessionDate,
      status: c.status,
      currency: c.currency,
      variance: c.variance ? new Decimal(c.variance.toString()).toFixed(2) : null,
      openingBalance: new Decimal(c.openingBalance.toString()).toFixed(2),
      declaredCash: c.declaredCash ? new Decimal(c.declaredCash.toString()).toFixed(2) : null,
      submittedAt: c.closedAt,
      approvedAt: c.approvedAt,
    })),
    total,
  }
}
