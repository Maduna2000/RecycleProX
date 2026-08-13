import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { Prisma } from '@prisma/client'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { resolvePrice } from '@/lib/services/productService'
import { recordMovement, recordVoidReversal } from '@/lib/services/stockService'
import { applyRepaymentTx, reverseRepaymentsForPurchase } from '@/lib/services/loanService'
import { isSessionDateApproved } from '@/lib/services/cashUpService'
import { autoPromoteCasualIfEligible } from '@/lib/services/customerService'
import { sastDayLabelOfInstant, sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'
import { getAllSettings } from '@/lib/services/settingsService'
import { generateVat264 } from '@/lib/pdf/vat264'
import { generatePurchaseReceiptPdf } from '@/lib/pdf/slip'
import { uploadBytes, purchaseVat264Key, purchaseNoteKey } from '@/lib/r2'
import { CURRENCY_SYMBOLS } from '@/lib/schemas/cashup'
import { VAT_RATE, purchaseHeaderVat } from '@/lib/utils/vat'
import { ScaleOrderNotFoundError, ScaleOrderAlreadyVoidedError } from '@/lib/services/scaleService'
import type { CreatePurchaseInput, VoidPurchaseInput, ReversePurchasePaymentInput, UpdatePurchaseInput } from '@/lib/schemas/purchase'
import type { ProcessSplitPaymentInput } from '@/lib/schemas/splitPayment'
import { encodeJsonField } from '@/lib/db/queryHelpers'
import { encodePhotoKeys, decodePhotoKeys } from '@/lib/offline/photoKeysCodec'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class PurchaseNotFoundError extends Error {
  constructor(id: string) { super(`Purchase "${id}" not found`); this.name = 'PurchaseNotFoundError' }
}

export class PurchaseAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Purchase "${ref}" is already voided`); this.name = 'PurchaseAlreadyVoidedError' }
}

export class PurchaseNotCompletedError extends Error {
  constructor(status: string) { super(`Purchase is not completed (status: ${status}) — only a completed purchase's payment can be reversed`); this.name = 'PurchaseNotCompletedError' }
}

export class CashUpAlreadyApprovedError extends Error {
  constructor(dateLabel: string) { super(`Cannot reverse or void — ${dateLabel}'s cash-up has already been approved`); this.name = 'CashUpAlreadyApprovedError' }
}

export class AmountAlreadyPaidError extends Error {
  constructor() { super('This purchase already has a payment recorded against it — void it instead of editing'); this.name = 'AmountAlreadyPaidError' }
}

export class CustomerBlacklistedError extends Error {
  constructor() { super('Customer is blacklisted and cannot complete a purchase'); this.name = 'CustomerBlacklistedError' }
}

export class CustomerInactiveError extends Error {
  constructor() { super('Customer account is inactive'); this.name = 'CustomerInactiveError' }
}

export class ProductInactiveError extends Error {
  constructor(code: string) { super(`Product "${code}" is inactive`); this.name = 'ProductInactiveError' }
}

export class ScaleOrderAlreadyLinkedError extends Error {
  constructor(ref: string) { super(`ScaleOrder "${ref}" is already linked to a purchase`); this.name = 'ScaleOrderAlreadyLinkedError' }
}


export class PurchaseNotPendingError extends Error {
  constructor(status: string) { super(`Purchase is already "${status}" and cannot be settled`); this.name = 'PurchaseNotPendingError' }
}

export class PaymentExceedsBalanceError extends Error {
  constructor(settle: string, outstanding: string) { super(`Payment amount (R ${settle}) exceeds remaining balance (R ${outstanding})`); this.name = 'PaymentExceedsBalanceError' }
}

export class PartialPaymentNotAllowedError extends Error {
  constructor(paid: string, outstanding: string) { super(`Full payment required. Paid R ${paid} but R ${outstanding} is owed.`); this.name = 'PartialPaymentNotAllowedError' }
}

// ─── Reference number generator ───────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Generated inside the transaction so it's atomic with the insert
async function generateRefNumber(tx: TxClient): Promise<string> {
  const count = await tx.purchase.count()
  return `P${String(count + 1).padStart(5, '0')}`
}

// ─── Cash-effect day (for the cash-up lock) ───────────────────────────────────
// A completed purchase's cash was counted into whichever day's cash-up its
// settlement Payment row (markPurchasePaid/processSplitPayment) landed on —
// see calcSystemTotals in cashUpService.ts, which buckets Payment rows by
// their own createdAt, not the parent purchase's. Only a purchase that was
// completed directly at creation, with no Payment row ever created, has its
// cash counted on its own createdAt (the payments:{none:{}} branch there).
// Using purchase.createdAt unconditionally here would check the wrong day
// whenever a purchase sat pending before being settled later — letting a
// reversal slip through against a day whose cash-up is already approved.
async function purchaseCashEffectDayLabel(tx: TxClient, purchase: { id: string; createdAt: Date }): Promise<string> {
  const settlement = await tx.payment.findFirst({
    where: { purchaseId: purchase.id, voidedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  return sastDayLabelOfInstant(settlement?.createdAt ?? purchase.createdAt)
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

// ─── Auto-generate PDFs post-creation ────────────────────────────────────────
// Fire-and-forget — called after createPurchase transaction. Errors are logged
// but do not fail the purchase. The on-demand routes remain as fallbacks.

type PurchaseWithCustomerAndLines = Prisma.PurchaseGetPayload<{
  include: { customer: true; lines: { include: { product: true } } }
}>

async function generateAndStorePurchasePdfs(purchase: PurchaseWithCustomerAndLines): Promise<void> {
  const [settings, latestCashUp] = await Promise.all([
    getAllSettings(),
    prisma.cashUp.findFirst({ orderBy: { sessionDate: 'desc' }, select: { currency: true } }),
  ])
  const currencySymbol =
    CURRENCY_SYMBOLS[latestCashUp?.currency as keyof typeof CURRENCY_SYMBOLS] ?? 'R'

  const vat264Lines = purchase.lines.map((l) => ({
    description: l.product.name,
    quantity:    l.quantity.toString(),
    unit:        l.product.unit,
    unitPrice:   l.unitPrice.toString(),
    lineTotal:   l.lineTotal.toString(),
  }))

  // VAT264
  try {
    const bytes = await generateVat264({
      dealerName:     settings.yardName    ?? 'Renovo Pro',
      dealerAddress:  settings.yardAddress ?? 'Matsapha, Eswatini',
      dealerVatNo:    settings.vatNumber   ?? '',
      dealerPhone:    settings.dealerPhone,
      refNumber:      purchase.refNumber,
      date:           new Date(purchase.createdAt),
      sellerName:     `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      sellerIdNumber: purchase.customer.idNumber ?? '',
      sellerAddress:  purchase.customer.physicalAddress ?? undefined,
      sellerPhone:    purchase.customer.phone,
      lines:          vat264Lines,
      totalAmount:    purchase.totalAmount.toString(),
      paymentMethod:  purchase.paymentMethod,
      currencySymbol,
    })
    const key = purchaseVat264Key(purchase.id)
    await uploadBytes(key, bytes, 'application/pdf')
    await prisma.purchase.update({ where: { id: purchase.id }, data: { vat264R2Key: key } })
    logger.info({ purchaseId: purchase.id, key }, 'purchase.vat264.stored')
  } catch (err) {
    logger.error({ err, purchaseId: purchase.id }, 'purchase.vat264.generation.failed')
  }

  // Purchase note (slip) — same legacy layout as the thermal printout, see
  // generatePurchaseReceiptPdf's own header comment.
  try {
    const slipLines = purchase.lines.map((l) => ({
      productCode: l.product.code,
      productName: l.product.name,
      qty:         Number(l.quantity),
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
      grossQty:    l.grossQty ? l.grossQty.toString() : undefined,
      tareQty:     l.tareQty  ? l.tareQty.toString()  : undefined,
    }))
    const bytes = await generatePurchaseReceiptPdf({
      refNumber:      purchase.refNumber,
      // The sequence number already embedded in the ref number (PNNNNN, or
      // PUR-YYYYMMDD-NNNN for purchases predating the short format) — there's
      // no separate slip-book counter in the system, this is the closest
      // existing equivalent to the legacy paper receipt's "Slip No."
      slipNo:         Number(purchase.refNumber.match(/\d+$/)?.[0] ?? 0),
      status:         purchase.status,
      customerCode:   purchase.customer.accountCode ?? undefined,
      customerName:   `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      customerIdNo:   purchase.customer.idNumber ?? undefined,
      customerPhone:  purchase.customer.phone ?? undefined,
      customerVatNumber: purchase.customer.vatNumber ?? undefined,
      lines:          slipLines,
      totalAmount:    purchase.totalAmount.toString(),
      vatAmount:      purchase.vatAmount ? purchase.vatAmount.toString() : undefined,
      loanDeduction:  purchase.loanDeductionAmount ? { amount: purchase.loanDeductionAmount.toString() } : undefined,
      paymentMethod:  purchase.paymentMethod,
      cashierName:    'System',
      createdAt:      new Date(purchase.createdAt),
      footerText:     settings.purchaseNoteDeclaration,
      companyName:    settings.yardName,
      companyAddress: settings.yardAddress,
      companyPhone:   settings.yardPhone,
      vatNumber:      settings.vatNumber,
    })
    const key = purchaseNoteKey(purchase.id)
    await uploadBytes(key, bytes, 'application/pdf')
    await prisma.purchase.update({ where: { id: purchase.id }, data: { purchaseNoteR2Key: key } })
    logger.info({ purchaseId: purchase.id, key }, 'purchase.note.stored')
  } catch (err) {
    logger.error({ err, purchaseId: purchase.id }, 'purchase.note.generation.failed')
  }
}

// ─── Create Purchase ──────────────────────────────────────────────────────────

export async function createPurchase(data: CreatePurchaseInput, createdByUserId?: string) {
  // Validate customer
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
  if (!customer) throw new Error('Customer not found')
  if (customer.blacklisted) throw new CustomerBlacklistedError()
  if (!customer.isActive) throw new CustomerInactiveError()

  // Validate all products and resolve prices
  const resolvedLines = await Promise.all(
    data.lines.map(async (line) => {
      const product = await prisma.product.findUnique({ where: { id: line.productId } })
      if (!product) throw new Error(`Product "${line.productId}" not found`)
      if (!product.isActive) throw new ProductInactiveError(product.code)

      // Resolve the standard/price-group price for this customer
      const resolved = await resolvePrice(line.productId, customer.priceGroupId)
      const unitPrice = new Decimal(line.unitPrice)
      const quantity = new Decimal(line.quantity)
      const lineTotal = unitPrice.times(quantity)

      // A negative unit price is a deduction line (e.g. transport/service
      // charge netted off the payout) rather than real goods received — it
      // never carries VAT, regardless of what was ticked.
      const isDeduction = unitPrice.isNegative()

      // Server-side VAT: only lines the cashier ticked, never for zero-rated customers
      const vatApplied = !isDeduction && (line.vatApplied ?? false) && !customer.zeroRated
      const vatAmount = vatApplied ? lineTotal.times(VAT_RATE).toDecimalPlaces(2) : new Decimal(0)

      // Detect cashier override: submitted price differs from the resolved standard price
      const standardPrice = new Decimal(resolved.buyPrice.toString())
      const isOverride = !unitPrice.equals(standardPrice)
      const priceSource = isOverride ? 'cashier_override' : resolved.source

      if (isOverride) {
        logger.warn(
          { productId: line.productId, submittedPrice: unitPrice.toFixed(2), standardPrice: standardPrice.toFixed(2), createdByUserId },
          'purchase.price.override — cashier submitted price differs from standard'
        )
      }

      return {
        productId:       line.productId,
        quantity,
        grossQty:        line.grossQty        ? new Decimal(line.grossQty)        : undefined,
        tareQty:         line.tareQty         ? new Decimal(line.tareQty)         : undefined,
        tareReason:      line.tareReason      ?? undefined,
        deductionQty:    line.deductionQty    ? new Decimal(line.deductionQty)    : undefined,
        deductionReason: line.deductionReason ?? undefined,
        unitPrice,
        lineTotal,
        vatApplied,
        vatAmount,
        priceSource,
      }
    })
  )

  const subTotal = resolvedLines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0))
  const vatAmount = resolvedLines.reduce((sum, l) => sum.plus(l.vatAmount), new Decimal(0))
  // VAT-inclusive grand total — matches the cash actually paid out to the supplier
  const totalAmount = subTotal.plus(vatAmount)

  // Cap loan deduction at the total payout — never block the purchase
  const requestedDeduction = data.loanDeductionAmount ? new Decimal(data.loanDeductionAmount) : null
  const deduction = requestedDeduction ? Decimal.min(requestedDeduction, totalAmount) : null

  const purchase = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const refNumber = await generateRefNumber(tx)

      // Optional link to the scale-kiosk order this purchase was weighed
      // from — carries its scale-station photo into police copper reporting.
      if (data.scaleOrderId) {
        const scaleOrder = await tx.scaleOrder.findUnique({
          where: { id: data.scaleOrderId },
          select: { orderNumber: true, status: true, purchase: { select: { id: true } } },
        })
        if (!scaleOrder) throw new ScaleOrderNotFoundError(data.scaleOrderId)
        if (scaleOrder.status === 'voided') throw new ScaleOrderAlreadyVoidedError(scaleOrder.orderNumber)
        if (scaleOrder.purchase) throw new ScaleOrderAlreadyLinkedError(scaleOrder.orderNumber)
      }

    const p = await tx.purchase.create({
      data: {
        tenantId: requireTenantId(),
        refNumber,
        customerId: data.customerId,
        status: data.status ?? 'completed',
        totalAmount,
        vatAmount,
        loanDeductionAmount: deduction ?? undefined,
        paymentMethod: data.paymentMethod ?? 'cash',
        notes: data.notes,
        createdByUserId,
        scaleOrderId: data.scaleOrderId,
        lines: {
          create: resolvedLines.map((l) => ({
            tenantId:        requireTenantId(),
            productId:       l.productId,
            quantity:        l.quantity,
            grossQty:        l.grossQty,
            tareQty:         l.tareQty,
            tareReason:      l.tareReason,
            deductionQty:    l.deductionQty,
            deductionReason: l.deductionReason,
            unitPrice:       l.unitPrice,
            lineTotal:       l.lineTotal,
            vatApplied:      l.vatApplied,
            vatAmount:       l.vatAmount,
            priceSource:     l.priceSource,
          })),
        },
      },
      include: { lines: { include: { product: true } }, customer: true },
    })

    if (data.scaleOrderId) {
      await tx.scaleOrder.update({ where: { id: data.scaleOrderId }, data: { status: 'processed' } })
    }

    // Stock IN: yard received material from customer. Deduction lines
    // (negative unit price) never move stock — no goods actually changed hands.
    for (const line of resolvedLines) {
      if (line.unitPrice.isNegative()) continue
      await recordMovement(tx, {
        productId: line.productId,
        direction: 'in',
        quantity: line.quantity,
        source: 'purchase',
        sourceId: p.id,
        createdByUserId,
      })
    }

    // Apply loan deduction as a repayment (FIFO across active loans)
    if (deduction && deduction.greaterThan(0)) {
      await applyRepaymentTx(tx, data.customerId, deduction.toString(), createdByUserId, p.id)
    }

      return p
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ purchaseId: purchase.id, refNumber: purchase.refNumber, customerId: data.customerId, totalAmount: totalAmount.toFixed(2), createdByUserId }, 'purchase.created')

  // Fire-and-forget: generate VAT264 + purchase note PDFs and store in R2
  void generateAndStorePurchasePdfs(purchase)

  if (purchase.status === 'completed' && createdByUserId) {
    await autoPromoteCasualIfEligible(data.customerId, createdByUserId)
  }

  return purchase
}

// ─── Void Purchase ────────────────────────────────────────────────────────────

export async function voidPurchase(id: string, data: VoidPurchaseInput, voidedById?: string) {
  const updated = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      // Re-read inside the transaction (not just before it) — under
      // Serializable isolation, a second concurrent void racing this one
      // gets a serialization failure on commit and retries here, seeing the
      // fresh 'voided' status instead of both requests reversing stock.
      const purchase = await tx.purchase.findUnique({ where: { id }, include: { lines: true } })
      if (!purchase) throw new PurchaseNotFoundError(id)
      if (purchase.status === 'voided') throw new PurchaseAlreadyVoidedError(purchase.refNumber)

      // Once the day this purchase's cash was actually counted has an
      // approved cash-up, its books are closed — void is refused outright
      // rather than recalculating the approved totals. No override; a
      // correction becomes a fresh adjusting transaction instead. A still-
      // pending purchase was never counted in any cash-up total, so there's
      // nothing to protect — only a completed one needs the check.
      if (purchase.status === 'completed') {
        const dayLabel = await purchaseCashEffectDayLabel(tx, purchase)
        if (await isSessionDateApproved(tx, sastDateLabelToUTCDate(dayLabel))) throw new CashUpAlreadyApprovedError(dayLabel)
      }

      const p = await tx.purchase.update({
        where: { id },
        data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.reason },
        include: { lines: { include: { product: true } }, customer: true },
      })

      // Reverse stock: remove the IN movements that came from this purchase.
      // Deduction lines (negative unit price) never posted a movement at
      // creation time, so they're excluded here too — reversing one would
      // fabricate a phantom OUT movement for stock that was never added.
      await recordVoidReversal(tx, {
        originalMovements: purchase.lines
          .filter((l) => !new Decimal(l.unitPrice.toString()).isNegative())
          .map((l) => ({
            productId: l.productId,
            direction: 'in' as const,
            quantity: new Decimal(l.quantity.toString()),
          })),
        sourceId: id,
        createdByUserId: voidedById,
      })

      // A settled (formerly pending) purchase has a linked Payment row
      // (markPurchasePaid/processSplitPayment) that voiding the purchase
      // itself never touched — it would keep counting in systemCashPayments
      // forever. Void it too, in the same transaction.
      await tx.payment.updateMany({
        where: { purchaseId: id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById, voidReason: data.reason },
      })

      // Same gap for a loan deduction applied at settlement — reverse it so
      // the customer's loan balance and the day's loan totals both reflect
      // that this purchase no longer happened.
      await reverseRepaymentsForPurchase(tx, id, purchase.refNumber, voidedById)

      return p
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ purchaseId: id, refNumber: updated.refNumber, voidedById }, 'purchase.voided')
  return updated
}

// ─── Reverse Purchase Payment ──────────────────────────────────────────────────
// Undoes a completed purchase's payment — sends it back to 'pending' so it
// re-appears in the unpaid queue to be settled again — without touching
// stock. That's what makes this different from voidPurchase: the goods were
// physically received and stay received; only the "this has been paid"
// fact is wrong and gets corrected. Use void instead when the purchase
// itself (goods and all) needs to be undone.

export async function reversePurchasePayment(id: string, data: ReversePurchasePaymentInput, userId?: string) {
  const updated = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id } })
      if (!purchase) throw new PurchaseNotFoundError(id)
      if (purchase.status !== 'completed') throw new PurchaseNotCompletedError(purchase.status)

      // Once the day this purchase's cash was actually counted has an
      // approved cash-up, its books are closed — a payment reversal is
      // refused outright. No override. Looked up before the settlement
      // Payment row is voided below, while it's still live.
      const dayLabel = await purchaseCashEffectDayLabel(tx, purchase)
      if (await isSessionDateApproved(tx, sastDateLabelToUTCDate(dayLabel))) throw new CashUpAlreadyApprovedError(dayLabel)

      const p = await tx.purchase.update({
        where: { id },
        data: {
          status:               'pending',
          amountPaid:           0,
          loanDeductionAmount:  null,
          hasOutstandingBalance: true,
        },
        include: { lines: { include: { product: true } }, customer: true },
      })

      // Void whatever settlement Payment row(s) recorded this payout (markPurchasePaid/
      // processSplitPayment) — mirrors voidPurchase's handling of the same gap.
      await tx.payment.updateMany({
        where: { purchaseId: id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: userId, voidReason: data.reason },
      })

      // Reverse any loan deduction tied to this purchase, whether it was applied
      // at creation or at settlement — the customer's loan balance must reflect
      // that nothing has actually been paid toward it.
      await reverseRepaymentsForPurchase(tx, id, purchase.refNumber, userId, 'payment reversed')

      return p
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ purchaseId: id, refNumber: updated.refNumber, userId }, 'purchase.payment.reversed')
  return updated
}

// ─── Update Purchase ────────────────────────────────────────────────────────────
// Corrects a pending purchase's products, customer, payment method, or notes
// in place — only usable before any money has moved (amountPaid must be
// zero; a partially-paid pending purchase has to be voided instead, since
// there's no way to unwind just the payment on a still-pending record).
//
// Full replace, not a per-line diff: this purchase's own PurchaseLine rows
// and stock movements are deleted and re-created from the submitted lines,
// rather than trying to match old lines to new ones by product (ambiguous —
// the same product could appear twice, or get swapped for a different one
// entirely). Net effect on stock is identical to a diff, without the
// matching logic.

export async function updatePurchase(id: string, data: UpdatePurchaseInput, userId?: string) {
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
  if (!customer) throw new Error('Customer not found')
  if (customer.blacklisted) throw new CustomerBlacklistedError()
  if (!customer.isActive) throw new CustomerInactiveError()

  const resolvedLines = await Promise.all(
    data.lines.map(async (line) => {
      const product = await prisma.product.findUnique({ where: { id: line.productId } })
      if (!product) throw new Error(`Product "${line.productId}" not found`)
      if (!product.isActive) throw new ProductInactiveError(product.code)

      const resolved = await resolvePrice(line.productId, customer.priceGroupId)
      const unitPrice = new Decimal(line.unitPrice)
      const quantity = new Decimal(line.quantity)
      const lineTotal = unitPrice.times(quantity)

      // Same deduction-line handling as createPurchase — a negative unit
      // price nets off the payout without ever touching stock or VAT.
      const isDeduction = unitPrice.isNegative()
      const vatApplied = !isDeduction && (line.vatApplied ?? false) && !customer.zeroRated
      const vatAmount = vatApplied ? lineTotal.times(VAT_RATE).toDecimalPlaces(2) : new Decimal(0)

      const standardPrice = new Decimal(resolved.buyPrice.toString())
      const isOverride = !unitPrice.equals(standardPrice)
      const priceSource = isOverride ? 'cashier_override' : resolved.source

      if (isOverride) {
        logger.warn(
          { productId: line.productId, submittedPrice: unitPrice.toFixed(2), standardPrice: standardPrice.toFixed(2), userId },
          'purchase.price.override — cashier submitted price differs from standard (edit)'
        )
      }

      return {
        productId:       line.productId,
        quantity,
        grossQty:        line.grossQty        ? new Decimal(line.grossQty)        : undefined,
        tareQty:         line.tareQty         ? new Decimal(line.tareQty)         : undefined,
        tareReason:      line.tareReason      ?? undefined,
        deductionQty:    line.deductionQty    ? new Decimal(line.deductionQty)    : undefined,
        deductionReason: line.deductionReason ?? undefined,
        unitPrice,
        lineTotal,
        vatApplied,
        vatAmount,
        priceSource,
      }
    })
  )

  const subTotal    = resolvedLines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0))
  const vatTotal    = resolvedLines.reduce((sum, l) => sum.plus(l.vatAmount), new Decimal(0))
  const totalAmount = subTotal.plus(vatTotal)

  const requestedDeduction = data.loanDeductionAmount ? new Decimal(data.loanDeductionAmount) : null
  const deduction = requestedDeduction ? Decimal.min(requestedDeduction, totalAmount) : null

  const updated = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id } })
      if (!purchase) throw new PurchaseNotFoundError(id)
      if (purchase.status !== 'pending') throw new PurchaseNotPendingError(purchase.status)
      if (new Decimal(purchase.amountPaid.toString()).greaterThan(0)) throw new AmountAlreadyPaidError()

      // Reverse any repayment already tied to this purchase (createPurchase
      // applies a loan deduction unconditionally, even on a pending
      // purchase) before re-applying the edited amount below.
      await reverseRepaymentsForPurchase(tx, id, purchase.refNumber, userId, 'purchase edited')

      // This purchase's own stock movements and line rows only — deleting
      // by sourceId/purchaseId can't touch any other transaction's ledger.
      await tx.stockMovement.deleteMany({ where: { source: 'purchase', sourceId: id } })
      await tx.purchaseLine.deleteMany({ where: { purchaseId: id } })

      const p = await tx.purchase.update({
        where: { id },
        data: {
          customerId:          data.customerId,
          totalAmount,
          vatAmount:           vatTotal,
          loanDeductionAmount: deduction ?? null,
          paymentMethod:       data.paymentMethod,
          notes:               data.notes,
          lines: {
            create: resolvedLines.map((l) => ({
              tenantId:        requireTenantId(),
              productId:       l.productId,
              quantity:        l.quantity,
              grossQty:        l.grossQty,
              tareQty:         l.tareQty,
              tareReason:      l.tareReason,
              deductionQty:    l.deductionQty,
              deductionReason: l.deductionReason,
              unitPrice:       l.unitPrice,
              lineTotal:       l.lineTotal,
              vatApplied:      l.vatApplied,
              vatAmount:       l.vatAmount,
              priceSource:     l.priceSource,
            })),
          },
        },
        include: { lines: { include: { product: true } }, customer: true },
      })

      for (const line of resolvedLines) {
        if (line.unitPrice.isNegative()) continue
        await recordMovement(tx, {
          productId: line.productId,
          direction: 'in',
          quantity: line.quantity,
          source: 'purchase',
          sourceId: id,
          createdByUserId: userId,
          // Backdated to when the goods actually arrived, not when the
          // correction was made — otherwise a point-in-time stock report
          // covering the gap between creation and this edit would
          // retroactively show them as not yet received.
          createdAt: purchase.createdAt,
        })
      }

      if (deduction && deduction.greaterThan(0)) {
        await applyRepaymentTx(tx, data.customerId, deduction.toString(), userId, id)
      }

      return p
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ purchaseId: id, refNumber: updated.refNumber, userId }, 'purchase.updated')

  // Fire-and-forget: regenerate VAT264 + purchase note PDFs so anything
  // reprinted reflects the edited products/totals, not the pre-edit state.
  void generateAndStorePurchasePdfs(updated)

  return updated
}

// ─── Get Purchase ─────────────────────────────────────────────────────────────

export async function getPurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        include: { product: true },
        orderBy: { createdAt: 'asc' },
      },
      // Only set when this purchase came through the Scale Station
      // queue-number flow — used to print "Scale Op" on the receipt.
      scaleOrder: { include: { operator: true } },
    },
  })
  if (!purchase) throw new PurchaseNotFoundError(id)
  return purchase
}

// ─── Mark Purchase Paid (partial or full settlement) ─────────────────────────
// Wrapped in a Serializable transaction to prevent concurrent double-payment.
// Also creates a Payment record so the cash-up formula captures this payout.

export async function markPurchasePaid(
  id: string,
  data: { amount: string; paymentMethod: string },
  userId: string
) {
  const result = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      // Lock the row inside the tx — re-read under serializable isolation
      const purchase = await tx.purchase.findUniqueOrThrow({ where: { id } })
      if (purchase.status !== 'pending') throw new PurchaseNotPendingError(purchase.status)

      const totalAmount   = new Decimal(purchase.totalAmount.toString())
      const loanDeduction = purchase.loanDeductionAmount
        ? new Decimal(purchase.loanDeductionAmount.toString())
        : new Decimal(0)
      const currentPaid   = new Decimal(purchase.amountPaid.toString())
      const outstanding   = totalAmount.minus(loanDeduction).minus(currentPaid)
      const settleAmount  = new Decimal(data.amount)

      if (settleAmount.greaterThan(outstanding)) {
        throw new PaymentExceedsBalanceError(settleAmount.toFixed(2), outstanding.toFixed(2))
      }

      // Full payment required - no partial payments allowed
      if (settleAmount.lessThan(outstanding)) {
        throw new PartialPaymentNotAllowedError(settleAmount.toFixed(2), outstanding.toFixed(2))
      }

      const isFullySettled = currentPaid.plus(settleAmount).gte(totalAmount.minus(loanDeduction))

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          amountPaid:    { increment: settleAmount },
          paymentMethod: data.paymentMethod as Prisma.PurchaseUpdateInput['paymentMethod'],
          ...(isFullySettled ? { status: 'completed' } : {}),
        },
      })

      // Create a Payment record so cash-up cashPayments formula captures this payout
      const today = new Date()
      const prefix = `PAY-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const payCount = await tx.payment.count({ where: { createdAt: { gte: startOfDay } } })
      const refNumber = `${prefix}-${String(payCount + 1).padStart(4, '0')}`

      await tx.payment.create({
        data: {
          tenantId:        requireTenantId(),
          refNumber,
          customerId:      purchase.customerId,
          amount:          settleAmount,
          paymentMethod:   data.paymentMethod as 'cash' | 'eft',
          notes:           `Settlement of purchase ${purchase.refNumber}`,
          source:          'purchase',
          purchaseId:      purchase.id,
          createdByUserId: userId,
        },
      })

      return { updated, isFullySettled }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info(
    { purchaseId: id, userId, settleAmount: data.amount, isFullySettled: result.isFullySettled },
    'purchase.payment.recorded'
  )

  if (result.isFullySettled) {
    await autoPromoteCasualIfEligible(result.updated.customerId, userId)
  }

  return result
}

// ─── Process Split Payment ────────────────────────────────────────────────────
// Allows paying a purchase with multiple payment methods simultaneously.
// Loan deduction is mandatory when customer has outstanding loan.

export async function processSplitPayment(
  id: string,
  data: ProcessSplitPaymentInput,
  userId: string
) {
  const result = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id },
        include: { customer: true },
      })

      if (purchase.status !== 'pending') {
        throw new PurchaseNotPendingError(purchase.status)
      }

      const totalAmount   = new Decimal(purchase.totalAmount.toString())
      const currentPaid   = new Decimal(purchase.amountPaid.toString())
      const existingLoan  = purchase.loanDeductionAmount
        ? new Decimal(purchase.loanDeductionAmount.toString())
        : new Decimal(0)

      const cashAmt   = new Decimal(data.payments.cash || '0')
      const eftAmt    = new Decimal(data.payments.eft  || '0')
      const loanAmt   = new Decimal(data.payments.loan || '0')

      const paymentTotal = cashAmt.plus(eftAmt).plus(loanAmt)
      const outstanding  = totalAmount.minus(existingLoan).minus(currentPaid)

      if (paymentTotal.greaterThan(outstanding)) {
        throw new PaymentExceedsBalanceError(paymentTotal.toFixed(2), outstanding.toFixed(2))
      }

      // Split payment requires FULL payment - no partial payments allowed
      if (paymentTotal.lessThan(outstanding)) {
        throw new PartialPaymentNotAllowedError(paymentTotal.toFixed(2), outstanding.toFixed(2))
      }

      // Apply loan repayment if loan amount > 0
      if (loanAmt.greaterThan(0)) {
        await applyRepaymentTx(tx, purchase.customerId, loanAmt.toString(), userId, id)
      }

      const newLoanDeduction = existingLoan.plus(loanAmt)
      const newPaid = currentPaid.plus(cashAmt).plus(eftAmt)
      const isFullySettled = newPaid.plus(newLoanDeduction).gte(totalAmount)

      // Determine primary payment method (largest non-loan amount)
      const primaryMethod: 'cash' | 'eft' = eftAmt.greaterThan(cashAmt) ? 'eft' : 'cash'

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          amountPaid:          newPaid,
          loanDeductionAmount: newLoanDeduction,
          paymentMethod:       primaryMethod,
          splitPayments: encodeJsonField({
            cash: cashAmt.toFixed(2),
            eft:  eftAmt.toFixed(2),
            loan: loanAmt.toFixed(2),
          }),
          ...(isFullySettled ? { status: 'completed' } : {}),
        },
      })

      // Create Payment records for each method (for cash-up tracking)
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
            customerId:      purchase.customerId,
            amount:          p.amount,
            paymentMethod:   p.method,
            notes:           `Split payment for ${purchase.refNumber} (${p.method})`,
            source:          'purchase',
            purchaseId:      purchase.id,
            createdByUserId: userId,
          },
        })
      }

      return { updated, isFullySettled }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info(
    {
      purchaseId: id,
      userId,
      splitPayments: data.payments,
      isFullySettled: result.isFullySettled,
    },
    'purchase.split.payment.recorded'
  )

  if (result.isFullySettled) {
    await autoPromoteCasualIfEligible(result.updated.customerId, userId)
  }

  return result
}

// ─── Update Purchase Photos ───────────────────────────────────────────────────

export async function updatePurchasePhotos(
  id: string,
  action: { add?: string; remove?: string },
  userId: string
) {
  const purchase = await prisma.purchase.findUnique({ where: { id }, select: { photoR2Keys: true } })
  if (!purchase) throw new PurchaseNotFoundError(id)

  if (!action.add && !action.remove) throw new Error('Provide add or remove')

  const existingKeys = decodePhotoKeys(purchase.photoR2Keys)
  const keys = action.add
    ? [...existingKeys, action.add]
    : existingKeys.filter((k) => k !== action.remove)

  const updated = await prisma.purchase.update({
    where:  { id },
    data:   { photoR2Keys: encodePhotoKeys(keys) },
    select: { photoR2Keys: true },
  })

  logger.info({ purchaseId: id, userId, action: action.add ? 'photo_added' : 'photo_removed' }, 'purchase.photos.updated')
  return updated
}

// ─── Save Purchase Signature ──────────────────────────────────────────────────

export async function savePurchaseSignature(id: string, signatureR2Key: string, userId: string) {
  const purchase = await prisma.purchase.findUnique({ where: { id } })
  if (!purchase) throw new PurchaseNotFoundError(id)

  await prisma.purchase.update({ where: { id }, data: { signatureR2Key } })
  logger.info({ purchaseId: id, userId }, 'purchase.signature.saved')
}

// ─── List Purchases ───────────────────────────────────────────────────────────

export async function listPurchases(opts?: {
  customerId?: string
  status?: string
  from?: Date
  to?: Date
  search?: string
  paymentMethod?: string
  page?: number
  pageSize?: number
}) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const where = {
    ...(opts?.customerId && { customerId: opts.customerId }),
    ...(opts?.status && { status: opts.status as 'completed' | 'voided' | 'pending' }),
    ...(opts?.paymentMethod && { paymentMethod: opts.paymentMethod as 'cash' | 'eft' }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts.from && { gte: opts.from }),
        ...(opts.to && { lte: opts.to }),
      },
    } : {}),
    ...(opts?.search && {
      OR: [
        { refNumber: { contains: opts.search, mode: 'insensitive' as const } },
        { customer: { firstName: { contains: opts.search, mode: 'insensitive' as const } } },
        { customer: { lastName: { contains: opts.search, mode: 'insensitive' as const } } },
        { customer: { idNumber: { contains: opts.search, mode: 'insensitive' as const } } },
      ],
    }),
  }

  // Voided purchases represent reversed spend, not real money paid out — exclude
  // them from the total unless the caller explicitly filtered for that status.
  const totalWhere = opts?.status ? where : { ...where, status: { not: 'voided' as const } }

  const [rawPurchases, total, totalAgg] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true, zeroRated: true } },
        lines: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.aggregate({ where: totalWhere, _sum: { totalAmount: true } }),
  ])

  const purchases = rawPurchases.map((p) => {
    const total = new Decimal(p.totalAmount.toString())
    // Persisted header VAT wins; legacy rows (null) derive from the inclusive total
    const vatAmount = purchaseHeaderVat(p, p.customer.zeroRated)
    const subTotal = total.minus(vatAmount).toDecimalPlaces(2)
    return { ...p, subTotal: subTotal.toFixed(2), vatAmount: vatAmount.toFixed(2) }
  })

  const totalSum = new Decimal(totalAgg._sum.totalAmount?.toString() ?? '0').toFixed(2)

  return { purchases, total, totalSum, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}
