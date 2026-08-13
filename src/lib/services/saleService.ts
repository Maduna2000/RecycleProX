import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { Prisma } from '@prisma/client'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { recordMovement, recordVoidReversal } from '@/lib/services/stockService'
import { applyBusinessLoanRepaymentTx, reverseRepaymentsForSale } from '@/lib/services/businessLoanService'
import { isSessionDateApproved } from '@/lib/services/cashUpService'
import { sastDayLabelOfInstant, sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'
import type { CreateSaleInput, VoidSaleInput, ReverseSalePaymentInput, UpdateSaleInput } from '@/lib/schemas/sale'
import type { ProcessSaleSplitPaymentInput } from '@/lib/schemas/splitPayment'
import { encodeJsonField } from '@/lib/db/queryHelpers'
import { encodePhotoKeys, decodePhotoKeys } from '@/lib/offline/photoKeysCodec'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class SaleNotFoundError extends Error {
  constructor(id: string) { super(`Sale "${id}" not found`); this.name = 'SaleNotFoundError' }
}

export class SaleAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Sale "${ref}" is already voided`); this.name = 'SaleAlreadyVoidedError' }
}

export class SaleNotCompletedError extends Error {
  constructor(status: string) { super(`Sale is not completed (status: ${status}) — only a completed sale's payment can be reversed`); this.name = 'SaleNotCompletedError' }
}

export class SaleNotPendingError extends Error {
  constructor(status: string) { super(`Sale is not pending (status: ${status})`); this.name = 'SaleNotPendingError' }
}

export class SalePaymentExceedsBalanceError extends Error {
  constructor(amount: string, balance: string) {
    super(`Payment amount R${amount} exceeds remaining balance R${balance}`)
    this.name = 'SalePaymentExceedsBalanceError'
  }
}

export class ProductInactiveError extends Error {
  constructor(code: string) { super(`Product "${code}" is inactive`); this.name = 'ProductInactiveError' }
}

export class InsufficientStockError extends Error {
  constructor(name: string) { super(`Insufficient stock for "${name}"`); this.name = 'InsufficientStockError' }
}

export class SalePartialPaymentNotAllowedError extends Error {
  constructor(paid: string, outstanding: string) {
    super(`Full payment required. Paid R${paid} but R${outstanding} is owed.`)
    this.name = 'SalePartialPaymentNotAllowedError'
  }
}

export class SaleHasNoLinkedCustomerError extends Error {
  constructor() { super('Sale has no linked account customer — business loan deduction is not available'); this.name = 'SaleHasNoLinkedCustomerError' }
}

export class CashUpAlreadyApprovedError extends Error {
  constructor(dateLabel: string) { super(`Cannot reverse or void — ${dateLabel}'s cash-up has already been approved`); this.name = 'CashUpAlreadyApprovedError' }
}

export class AmountAlreadyPaidError extends Error {
  constructor() { super('This sale already has a payment recorded against it — void it instead of editing'); this.name = 'AmountAlreadyPaidError' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Reference number generated inside the transaction so it's atomic with the insert
async function generateRefNumber(tx: TxClient): Promise<string> {
  const today = new Date()
  const prefix = `SAL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await tx.sale.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// Retries on PostgreSQL serialization failures (P2034 / 40001)
async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn()
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      if (attempt < 3 && (code === 'P2034' || code === '40001')) continue
      throw e
    }
  }
  throw new Error('unreachable')
}

// ─── Create Sale ──────────────────────────────────────────────────────────────

export async function createSale(data: CreateSaleInput, createdByUserId?: string) {
  // VAT is opt-in — the cashier ticks "Apply VAT" (auto-filled client-side from
  // an account customer's VAT setting, but always re-resolved here, never
  // trusting a client-supplied rate). A customer explicitly flagged zero-rated
  // can never be charged VAT even if the checkbox was left ticked.
  let vatRate = new Decimal(0)
  if (data.applyVat) {
    vatRate = new Decimal('0.15')
    if (data.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { zeroRated: true } })
      if (customer?.zeroRated) vatRate = new Decimal(0)
    }
  }

  // Validate products outside transaction — read-only, no race risk
  const resolvedLines = await Promise.all(
    data.lines.map(async (line) => {
      const product = await prisma.product.findUnique({ where: { id: line.productId } })
      if (!product) throw new Error(`Product "${line.productId}" not found`)
      if (!product.isActive) throw new ProductInactiveError(product.code)

      const unitPrice = new Decimal(line.unitPrice)
      const quantity  = new Decimal(line.quantity)
      const lineTotal = unitPrice.times(quantity)

      return {
        productId:       line.productId,
        productName:     product.name,
        quantity,
        unitPrice,
        lineTotal,
        grossQty:        line.grossQty        ? new Decimal(line.grossQty)        : undefined,
        tareQty:         line.tareQty         ? new Decimal(line.tareQty)         : undefined,
        tareReason:      line.tareReason,
        deductionQty:    line.deductionQty    ? new Decimal(line.deductionQty)    : undefined,
        deductionReason: line.deductionReason,
      }
    })
  )

  const subTotal    = resolvedLines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0))
  const vatAmount   = subTotal.times(vatRate)
  const totalAmount = subTotal.plus(vatAmount)

  // Cap at the total — never block the sale. Mirrors createPurchase's
  // loanDeductionAmount handling exactly, just netting against what the
  // business owes this customer instead of what the customer owes the
  // business. Only meaningful when the sale settles immediately — a pending
  // sale hasn't been paid for at all yet, so nothing to deduct from.
  const isPending = data.status === 'pending'
  const requestedDeduction = data.businessLoanDeductionAmount ? new Decimal(data.businessLoanDeductionAmount) : null
  const deduction = requestedDeduction && !isPending ? Decimal.min(requestedDeduction, totalAmount) : null

  const sale = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      // Ref number inside tx — races resolved by Serializable isolation
      const refNumber = await generateRefNumber(tx)

      // Stock check inside tx — eliminates TOCTOU window between check and write
      for (const line of resolvedLines) {
        const inAgg = await tx.stockMovement.aggregate({
          where: { productId: line.productId, direction: 'in' },
          _sum: { quantity: true },
        })
        const outAgg = await tx.stockMovement.aggregate({
          where: { productId: line.productId, direction: 'out' },
          _sum: { quantity: true },
        })
        const onHand = new Decimal(inAgg._sum.quantity?.toString() ?? '0')
          .minus(new Decimal(outAgg._sum.quantity?.toString() ?? '0'))
        if (line.quantity.gt(onHand)) throw new InsufficientStockError(line.productName)
      }

      const s = await tx.sale.create({
        data: {
          tenantId:             requireTenantId(),
          refNumber,
          customerId:           data.customerId,
          buyerId:              data.buyerId,
          buyerName:            data.buyerName,
          buyerIdNumber:        data.buyerIdNumber,
          buyerPhone:           data.buyerPhone,
          status:               isPending ? 'pending' : 'completed',
          totalAmount,
          vatAmount,
          paymentMethod:        data.paymentMethod ?? 'cash',
          amountPaid:           isPending ? new Decimal(0) : totalAmount.minus(deduction ?? new Decimal(0)),
          businessLoanDeductionAmount: deduction ?? undefined,
          hasOutstandingBalance: isPending,
          notes:                data.notes,
          createdByUserId,
          lines: {
            create: resolvedLines.map((l) => ({
              tenantId:        requireTenantId(),
              productId:       l.productId,
              quantity:        l.quantity,
              unitPrice:       l.unitPrice,
              lineTotal:       l.lineTotal,
              grossQty:        l.grossQty,
              tareQty:         l.tareQty,
              tareReason:      l.tareReason,
              deductionQty:    l.deductionQty,
              deductionReason: l.deductionReason,
            })),
          },
        },
        include: { lines: { include: { product: true } } },
      })

      // Stock OUT: yard sold material to buyer
      for (const line of resolvedLines) {
        await recordMovement(tx, {
          productId: line.productId,
          direction: 'out',
          quantity:  line.quantity,
          source:    'sale',
          sourceId:  s.id,
          createdByUserId,
        })
      }

      // Apply the business loan deduction as a repayment (FIFO across active loans)
      if (deduction && deduction.greaterThan(0) && data.customerId) {
        await applyBusinessLoanRepaymentTx(tx, data.customerId, deduction.toString(), createdByUserId, s.id)
      }

      return s
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 })
  )

  logger.info({ saleId: sale.id, refNumber: sale.refNumber, subTotal: subTotal.toFixed(2), vatAmount: vatAmount.toFixed(2), totalAmount: totalAmount.toFixed(2), createdByUserId }, 'sale.created')
  return sale
}

// ─── Void Sale ────────────────────────────────────────────────────────────────

export async function voidSale(id: string, data: VoidSaleInput, voidedById?: string) {
  const updated = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      // Re-read inside the transaction (not just before it) — under
      // Serializable isolation, a second concurrent void racing this one
      // gets a serialization failure on commit and retries here, seeing the
      // fresh 'voided' status instead of both requests reversing stock.
      const sale = await tx.sale.findUnique({ where: { id }, include: { lines: true } })
      if (!sale) throw new SaleNotFoundError(id)
      if (sale.status === 'voided') throw new SaleAlreadyVoidedError(sale.refNumber)

      // Once this sale's day has an approved cash-up, its books are closed —
      // void is refused outright rather than recalculating the approved
      // totals. No override; a correction becomes a fresh adjusting
      // transaction instead.
      const dayLabel = sastDayLabelOfInstant(sale.createdAt)
      if (await isSessionDateApproved(tx, sastDateLabelToUTCDate(dayLabel))) throw new CashUpAlreadyApprovedError(dayLabel)

      const s = await tx.sale.update({
        where: { id },
        data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.reason },
        include: { lines: { include: { product: true } } },
      })

      // Reverse the stock OUT movements from this sale
      await recordVoidReversal(tx, {
        originalMovements: sale.lines.map((l) => ({
          productId: l.productId,
          direction: 'out' as const,
          quantity:  new Decimal(l.quantity.toString()),
        })),
        sourceId:       id,
        createdByUserId: voidedById,
      })

      // A settled (formerly pending) sale has a linked Payment row
      // (markSalePaid/processSaleSplitPayment) that voiding the sale itself
      // never touched — it would keep counting as cash received forever.
      // Void it too, in the same transaction.
      await tx.payment.updateMany({
        where: { saleId: id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById, voidReason: data.reason },
      })

      // Same gap for a business-loan deduction applied at settlement —
      // reverse it so the customer's business-loan balance reflects that
      // this sale no longer happened. (Business loans aren't part of the
      // cash-up formula at all today, so this only restores the loan
      // balance — no cashup recalculation needed for this specifically.)
      await reverseRepaymentsForSale(tx, id, sale.refNumber, voidedById)

      return s
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ saleId: id, refNumber: updated.refNumber, voidedById }, 'sale.voided')
  return updated
}

// ─── Reverse Sale Payment ───────────────────────────────────────────────────────
// Undoes a completed sale's payment — sends it back to 'pending' so it
// re-appears in the unpaid queue to be settled again — without touching
// stock. That's what makes this different from voidSale: the goods were
// physically handed over and stay sold; only the "this has been paid" fact
// is wrong and gets corrected. Use void instead when the sale itself
// (goods and all) needs to be undone.

export async function reverseSalePayment(id: string, data: ReverseSalePaymentInput, userId?: string) {
  const updated = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } })
      if (!sale) throw new SaleNotFoundError(id)
      if (sale.status !== 'completed') throw new SaleNotCompletedError(sale.status)

      // Once this sale's day has an approved cash-up, its books are closed —
      // a payment reversal is refused outright. No override.
      const dayLabel = sastDayLabelOfInstant(sale.createdAt)
      if (await isSessionDateApproved(tx, sastDateLabelToUTCDate(dayLabel))) throw new CashUpAlreadyApprovedError(dayLabel)

      const s = await tx.sale.update({
        where: { id },
        data: {
          status:                      'pending',
          amountPaid:                  0,
          businessLoanDeductionAmount: null,
          hasOutstandingBalance:       true,
        },
        include: { lines: { include: { product: true } } },
      })

      // Void whatever settlement Payment row(s) recorded this collection
      // (markSalePaid/processSaleSplitPayment) — mirrors voidSale's handling
      // of the same gap.
      await tx.payment.updateMany({
        where: { saleId: id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: userId, voidReason: data.reason },
      })

      // Reverse any business-loan deduction tied to this sale, whether it was
      // applied at creation or at settlement — the customer's business-loan
      // balance must reflect that nothing has actually been paid toward it.
      // (Business loans aren't part of the cash-up formula at all — nothing
      // further to recalculate for that part, same as voidSale.)
      await reverseRepaymentsForSale(tx, id, sale.refNumber, userId, 'payment reversed')

      return s
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ saleId: id, refNumber: updated.refNumber, userId }, 'sale.payment.reversed')
  return updated
}

// ─── Update Sale ──────────────────────────────────────────────────────────────
// Corrects a pending sale's products, buyer, payment method, or notes in
// place — only usable before any money has moved (amountPaid must be zero;
// a partially-paid pending sale has to be voided instead, since there's no
// way to unwind just the payment on a still-pending record).
//
// Full replace, not a per-line diff — same reasoning as updatePurchase. Old
// stock OUT movements are reversed before the new lines' availability is
// checked, so shrinking a line's quantity frees that stock back up for the
// new lines to draw from.

export async function updateSale(id: string, data: UpdateSaleInput, userId?: string) {
  // VAT is opt-in and always re-resolved server-side, never trusted from the
  // client — same rule as createSale.
  let vatRate = new Decimal(0)
  if (data.applyVat) {
    vatRate = new Decimal('0.15')
    if (data.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { zeroRated: true } })
      if (customer?.zeroRated) vatRate = new Decimal(0)
    }
  }

  const resolvedLines = await Promise.all(
    data.lines.map(async (line) => {
      const product = await prisma.product.findUnique({ where: { id: line.productId } })
      if (!product) throw new Error(`Product "${line.productId}" not found`)
      if (!product.isActive) throw new ProductInactiveError(product.code)

      const unitPrice = new Decimal(line.unitPrice)
      const quantity  = new Decimal(line.quantity)
      const lineTotal = unitPrice.times(quantity)

      return {
        productId:       line.productId,
        productName:     product.name,
        quantity,
        unitPrice,
        lineTotal,
        grossQty:        line.grossQty        ? new Decimal(line.grossQty)        : undefined,
        tareQty:         line.tareQty         ? new Decimal(line.tareQty)         : undefined,
        tareReason:      line.tareReason,
        deductionQty:    line.deductionQty    ? new Decimal(line.deductionQty)    : undefined,
        deductionReason: line.deductionReason,
      }
    })
  )

  const subTotal    = resolvedLines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0))
  const vatAmount   = subTotal.times(vatRate)
  const totalAmount = subTotal.plus(vatAmount)

  const updated = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } })
      if (!sale) throw new SaleNotFoundError(id)
      if (sale.status !== 'pending') throw new SaleNotPendingError(sale.status)
      if (sale.amountPaid && new Decimal(sale.amountPaid.toString()).greaterThan(0)) throw new AmountAlreadyPaidError()

      // This sale's own stock movements and line rows only — deleting by
      // sourceId/saleId can't touch any other transaction's ledger.
      await tx.stockMovement.deleteMany({ where: { source: 'sale', sourceId: id } })
      await tx.saleLine.deleteMany({ where: { saleId: id } })

      // Stock check inside the tx, after the reversal above frees this
      // sale's own old quantities back up — eliminates the TOCTOU window
      // between check and write, same as createSale.
      for (const line of resolvedLines) {
        const inAgg = await tx.stockMovement.aggregate({
          where: { productId: line.productId, direction: 'in' },
          _sum: { quantity: true },
        })
        const outAgg = await tx.stockMovement.aggregate({
          where: { productId: line.productId, direction: 'out' },
          _sum: { quantity: true },
        })
        const onHand = new Decimal(inAgg._sum.quantity?.toString() ?? '0')
          .minus(new Decimal(outAgg._sum.quantity?.toString() ?? '0'))
        if (line.quantity.gt(onHand)) throw new InsufficientStockError(line.productName)
      }

      const s = await tx.sale.update({
        where: { id },
        data: {
          customerId:    data.customerId,
          buyerId:       data.buyerId,
          buyerName:     data.buyerName,
          buyerIdNumber: data.buyerIdNumber,
          buyerPhone:    data.buyerPhone,
          totalAmount,
          vatAmount,
          paymentMethod: data.paymentMethod,
          notes:         data.notes,
          lines: {
            create: resolvedLines.map((l) => ({
              tenantId:        requireTenantId(),
              productId:       l.productId,
              quantity:        l.quantity,
              unitPrice:       l.unitPrice,
              lineTotal:       l.lineTotal,
              grossQty:        l.grossQty,
              tareQty:         l.tareQty,
              tareReason:      l.tareReason,
              deductionQty:    l.deductionQty,
              deductionReason: l.deductionReason,
            })),
          },
        },
        include: { lines: { include: { product: true } } },
      })

      for (const line of resolvedLines) {
        await recordMovement(tx, {
          productId: line.productId,
          direction: 'out',
          quantity:  line.quantity,
          source:    'sale',
          sourceId:  id,
          createdByUserId: userId,
        })
      }

      return s
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 })
  )

  logger.info({ saleId: id, refNumber: updated.refNumber, userId }, 'sale.updated')
  return updated
}

// ─── Get Sale ─────────────────────────────────────────────────────────────────

export async function getSale(id: string) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      lines: { include: { product: true }, orderBy: { createdAt: 'asc' } },
      customer: true,
    },
  })
  if (!sale) throw new SaleNotFoundError(id)
  return sale
}

// ─── Mark Sale Paid ───────────────────────────────────────────────────────────

export async function markSalePaid(
  id: string,
  data: { amount: string; paymentMethod: string },
  userId: string
) {
  const result = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id } })
      if (sale.status !== 'pending') throw new SaleNotPendingError(sale.status)

      const totalAmount  = new Decimal(sale.totalAmount.toString())
      const currentPaid  = new Decimal(sale.amountPaid?.toString() ?? '0')
      const outstanding  = totalAmount.minus(currentPaid)
      const settleAmount = new Decimal(data.amount)

      if (settleAmount.greaterThan(outstanding)) {
        throw new SalePaymentExceedsBalanceError(settleAmount.toFixed(2), outstanding.toFixed(2))
      }

      const isFullySettled = currentPaid.plus(settleAmount).gte(totalAmount)

      const updated = await tx.sale.update({
        where: { id },
        data: {
          amountPaid:           { increment: settleAmount },
          paymentMethod:        data.paymentMethod as Prisma.SaleUpdateInput['paymentMethod'],
          hasOutstandingBalance: !isFullySettled,
          ...(isFullySettled ? { status: 'completed' } : {}),
        },
      })

      // Payment record for cash-up
      const today = new Date()
      const prefix = `PAY-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const payCount = await tx.payment.count({ where: { createdAt: { gte: startOfDay } } })
      const refNumber = `${prefix}-${String(payCount + 1).padStart(4, '0')}`

      await tx.payment.create({
        data: {
          refNumber,
          ...(sale.customerId ? { customerId: sale.customerId } : {}),
          amount:          settleAmount,
          paymentMethod:   data.paymentMethod as 'cash' | 'eft',
          notes:           `Settlement of sale ${sale.refNumber}`,
          source:          'sale',
          saleId:          sale.id,
          createdByUserId: userId,
        } as Prisma.PaymentUncheckedCreateInput,
      })

      return { updated, isFullySettled }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 })
  )

  logger.info(
    { saleId: id, userId, settleAmount: data.amount, isFullySettled: result.isFullySettled },
    'sale.payment.recorded'
  )
  return result
}

// ─── Process Split Payment ────────────────────────────────────────────────────
// Sale-side counterpart to purchaseService.processSplitPayment. Lets a sale be
// settled with cash + eft + a deduction against the buyer's business loan
// (money the business owes them) instead of paying that portion out in cash.
// Full settlement required in one call, same as the purchase-side version.

export async function processSaleSplitPayment(
  id: string,
  data: ProcessSaleSplitPaymentInput,
  userId: string
) {
  const result = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id } })
      if (sale.status !== 'pending') throw new SaleNotPendingError(sale.status)

      const cashAmt         = new Decimal(data.payments.cash || '0')
      const eftAmt           = new Decimal(data.payments.eft  || '0')
      const businessLoanAmt = new Decimal(data.payments.businessLoan || '0')

      if (businessLoanAmt.greaterThan(0) && !sale.customerId) {
        throw new SaleHasNoLinkedCustomerError()
      }

      const totalAmount = new Decimal(sale.totalAmount.toString())
      const currentPaid = new Decimal(sale.amountPaid?.toString() ?? '0')
      const existingDeduction = sale.businessLoanDeductionAmount
        ? new Decimal(sale.businessLoanDeductionAmount.toString())
        : new Decimal(0)

      const paymentTotal = cashAmt.plus(eftAmt).plus(businessLoanAmt)
      const outstanding  = totalAmount.minus(existingDeduction).minus(currentPaid)

      if (paymentTotal.greaterThan(outstanding)) {
        throw new SalePaymentExceedsBalanceError(paymentTotal.toFixed(2), outstanding.toFixed(2))
      }

      // Split payment requires FULL payment - no partial payments allowed
      if (paymentTotal.lessThan(outstanding)) {
        throw new SalePartialPaymentNotAllowedError(paymentTotal.toFixed(2), outstanding.toFixed(2))
      }

      // Apply business loan repayment if that leg is > 0
      if (businessLoanAmt.greaterThan(0)) {
        await applyBusinessLoanRepaymentTx(tx, sale.customerId!, businessLoanAmt.toString(), userId, id)
      }

      const newDeduction = existingDeduction.plus(businessLoanAmt)
      const newPaid       = currentPaid.plus(cashAmt).plus(eftAmt)
      const isFullySettled = newPaid.plus(newDeduction).gte(totalAmount)

      // Determine primary payment method (largest non-loan amount)
      const primaryMethod: 'cash' | 'eft' = eftAmt.greaterThan(cashAmt) ? 'eft' : 'cash'

      const updated = await tx.sale.update({
        where: { id },
        data: {
          amountPaid:                  newPaid,
          businessLoanDeductionAmount: newDeduction,
          paymentMethod:               primaryMethod,
          hasOutstandingBalance:       !isFullySettled,
          splitPayments: encodeJsonField({
            cash:         cashAmt.toFixed(2),
            eft:          eftAmt.toFixed(2),
            businessLoan: businessLoanAmt.toFixed(2),
          }),
          ...(isFullySettled ? { status: 'completed' } : {}),
        },
      })

      // Payment records for cash-up (loan leg is not a physical payment)
      const today = new Date()
      const prefix = `PAY-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

      const payments: Array<{ method: 'cash' | 'eft'; amount: Decimal }> = []
      if (cashAmt.greaterThan(0)) payments.push({ method: 'cash', amount: cashAmt })
      if (eftAmt.greaterThan(0))  payments.push({ method: 'eft',  amount: eftAmt })

      for (const p of payments) {
        const payCount = await tx.payment.count({ where: { createdAt: { gte: startOfDay } } })
        await tx.payment.create({
          data: {
            tenantId:        requireTenantId(),
            refNumber:       `${prefix}-${String(payCount + 1).padStart(4, '0')}`,
            ...(sale.customerId ? { customerId: sale.customerId } : {}),
            amount:          p.amount,
            paymentMethod:   p.method,
            notes:           `Split payment for ${sale.refNumber} (${p.method})`,
            source:          'sale',
            saleId:          sale.id,
            createdByUserId: userId,
          } as Prisma.PaymentUncheckedCreateInput,
        })
      }

      return { updated, isFullySettled }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 })
  )

  logger.info(
    { saleId: id, userId, splitPayments: data.payments, isFullySettled: result.isFullySettled },
    'sale.split.payment.recorded'
  )
  return result
}

// ─── Update Sale Photos ───────────────────────────────────────────────────────

export async function updateSalePhotos(
  id: string,
  action: { add?: string; remove?: string },
  userId: string
) {
  const sale = await prisma.sale.findUnique({ where: { id }, select: { photoR2Keys: true } })
  if (!sale) throw new SaleNotFoundError(id)

  if (!action.add && !action.remove) throw new Error('Provide add or remove')

  const existingKeys = decodePhotoKeys(sale.photoR2Keys)
  const keys = action.add
    ? [...existingKeys, action.add]
    : existingKeys.filter((k) => k !== action.remove)

  const updated = await prisma.sale.update({
    where:  { id },
    data:   { photoR2Keys: encodePhotoKeys(keys) },
    select: { photoR2Keys: true },
  })

  logger.info({ saleId: id, userId, action: action.add ? 'photo_added' : 'photo_removed' }, 'sale.photos.updated')
  return updated
}

// ─── List Sales ───────────────────────────────────────────────────────────────

export async function listSales(opts?: {
  status?: string
  from?: Date
  to?: Date
  search?: string
  paymentMethod?: string
  page?: number
  pageSize?: number
}) {
  const page     = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip     = (page - 1) * pageSize

  const where = {
    ...(opts?.status        && { status:        opts.status        as 'completed' | 'voided' | 'pending' }),
    ...(opts?.paymentMethod && { paymentMethod: opts.paymentMethod as 'cash' | 'eft' }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts?.from && { gte: opts.from }),
        ...(opts?.to   && { lte: opts.to }),
      },
    } : {}),
    ...(opts?.search && {
      OR: [
        { refNumber:     { contains: opts.search, mode: 'insensitive' as const } },
        { buyerName:     { contains: opts.search, mode: 'insensitive' as const } },
        { buyerIdNumber: { contains: opts.search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include:  { lines: { select: { id: true } } },
      orderBy:  { createdAt: 'desc' },
      skip,
      take:     pageSize,
    }),
    prisma.sale.count({ where }),
  ])

  return { sales, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}
