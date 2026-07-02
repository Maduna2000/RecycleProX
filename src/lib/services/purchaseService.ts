import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { resolvePrice } from '@/lib/services/productService'
import { recordMovement, recordVoidReversal } from '@/lib/services/stockService'
import { applyRepaymentTx } from '@/lib/services/loanService'
import { getAllSettings } from '@/lib/services/settingsService'
import { generateVat264 } from '@/lib/pdf/vat264'
import { generateTransactionSlip } from '@/lib/pdf/slip'
import { uploadBytes, purchaseVat264Key, purchaseNoteKey } from '@/lib/r2'
import { VAT_RATE, purchaseHeaderVat } from '@/lib/utils/vat'
import type { CreatePurchaseInput, VoidPurchaseInput } from '@/lib/schemas/purchase'
import type { ProcessSplitPaymentInput } from '@/lib/schemas/splitPayment'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class PurchaseNotFoundError extends Error {
  constructor(id: string) { super(`Purchase "${id}" not found`); this.name = 'PurchaseNotFoundError' }
}

export class PurchaseAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Purchase "${ref}" is already voided`); this.name = 'PurchaseAlreadyVoidedError' }
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
  const today = new Date()
  const prefix = `PUR-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await tx.purchase.count({ where: { createdAt: { gte: startOfDay } } })
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

// ─── Auto-generate PDFs post-creation ────────────────────────────────────────
// Fire-and-forget — called after createPurchase transaction. Errors are logged
// but do not fail the purchase. The on-demand routes remain as fallbacks.

type PurchaseWithCustomerAndLines = Prisma.PurchaseGetPayload<{
  include: { customer: true; lines: { include: { product: true } } }
}>

async function generateAndStorePurchasePdfs(purchase: PurchaseWithCustomerAndLines): Promise<void> {
  const settings = await getAllSettings()

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
      dealerAddress:  settings.yardAddress ?? 'Pretoria, South Africa',
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
    })
    const key = purchaseVat264Key(purchase.id)
    await uploadBytes(key, bytes, 'application/pdf')
    await prisma.purchase.update({ where: { id: purchase.id }, data: { vat264R2Key: key } })
    logger.info({ purchaseId: purchase.id, key }, 'purchase.vat264.stored')
  } catch (err) {
    logger.error({ err, purchaseId: purchase.id }, 'purchase.vat264.generation.failed')
  }

  // Purchase note (slip)
  try {
    const slipLines = purchase.lines.map((l) => ({
      productName: l.product.name,
      qty:         Number(l.quantity),
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
      grossQty:    l.grossQty  ? Number(l.grossQty)  : undefined,
      tareQty:     l.tareQty   ? Number(l.tareQty)   : undefined,
      tareReason:  l.tareReason ?? undefined,
    }))
    const bytes = await generateTransactionSlip({
      type:           'PURCHASE',
      refNumber:      purchase.refNumber,
      date:           new Date(purchase.createdAt),
      partyLabel:     'Supplier',
      partyName:      `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      partyIdNumber:  purchase.customer.idNumber ?? undefined,
      partyPhone:     purchase.customer.phone ?? undefined,
      lines:          slipLines,
      totalAmount:    purchase.totalAmount.toString(),
      ...(purchase.vatAmount && new Decimal(purchase.vatAmount.toString()).greaterThan(0) ? {
        vatAmount:      new Decimal(purchase.vatAmount.toString()).toFixed(2),
        subtotalAmount: new Decimal(purchase.totalAmount.toString()).minus(purchase.vatAmount.toString()).toFixed(2),
      } : {}),
      loanDeduction:  purchase.loanDeductionAmount?.toString(),
      paymentMethod:  purchase.paymentMethod,
      cashierName:    'System',
      notes:          purchase.notes ?? undefined,
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

      // Server-side VAT: only lines the cashier ticked, never for zero-rated customers
      const vatApplied = (line.vatApplied ?? true) && !customer.zeroRated
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

    const p = await tx.purchase.create({
      data: {
        refNumber,
        customerId: data.customerId,
        status: data.status ?? 'completed',
        totalAmount,
        vatAmount,
        loanDeductionAmount: deduction ?? undefined,
        paymentMethod: data.paymentMethod ?? 'cash',
        notes: data.notes,
        createdByUserId,
        lines: {
          create: resolvedLines.map((l) => ({
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

    // Stock IN: yard received material from customer
    for (const line of resolvedLines) {
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

  return purchase
}

// ─── Void Purchase ────────────────────────────────────────────────────────────

export async function voidPurchase(id: string, data: VoidPurchaseInput, voidedById?: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!purchase) throw new PurchaseNotFoundError(id)
  if (purchase.status === 'voided') throw new PurchaseAlreadyVoidedError(purchase.refNumber)

  // Block voiding COMPLETED purchases if the date has an approved cash-up.
  // Pending purchases can be voided anytime — they weren't included in cash-up totals.
  const sessionDate = new Date(purchase.createdAt)
  sessionDate.setHours(0, 0, 0, 0)
  const approvedCashUp = await prisma.cashUp.findFirst({
    where: { sessionDate, status: 'approved' },
  })
  if (approvedCashUp && purchase.status === 'completed') {
    throw new Error(
      `Cannot void completed purchase ${purchase.refNumber}: the cash-up for that date (${sessionDate.toISOString().slice(0, 10)}) has already been approved. Contact a manager to investigate discrepancies.`
    )
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.purchase.update({
      where: { id },
      data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.reason },
      include: { lines: { include: { product: true } }, customer: true },
    })

    // Reverse stock: remove the IN movements that came from this purchase
    await recordVoidReversal(tx, {
      originalMovements: purchase.lines.map((l) => ({
        productId: l.productId,
        direction: 'in' as const,
        quantity: new Decimal(l.quantity.toString()),
      })),
      sourceId: id,
      createdByUserId: voidedById,
    })

    return p
  })

  logger.info({ purchaseId: id, refNumber: purchase.refNumber, voidedById }, 'purchase.voided')
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
          refNumber,
          customerId:      purchase.customerId,
          amount:          settleAmount,
          paymentMethod:   data.paymentMethod as 'cash' | 'eft' | 'cheque',
          notes:           `Settlement of purchase ${purchase.refNumber}`,
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

      const cashAmt   = new Decimal(data.payments.cash   || '0')
      const eftAmt    = new Decimal(data.payments.eft    || '0')
      const chequeAmt = new Decimal(data.payments.cheque || '0')
      const loanAmt   = new Decimal(data.payments.loan   || '0')

      const paymentTotal = cashAmt.plus(eftAmt).plus(chequeAmt).plus(loanAmt)
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
      const newPaid = currentPaid.plus(cashAmt).plus(eftAmt).plus(chequeAmt)
      const isFullySettled = newPaid.plus(newLoanDeduction).gte(totalAmount)

      // Determine primary payment method (largest non-loan amount)
      let primaryMethod: 'cash' | 'eft' | 'cheque' = 'cash'
      if (eftAmt.greaterThan(cashAmt) && eftAmt.greaterThan(chequeAmt)) {
        primaryMethod = 'eft'
      } else if (chequeAmt.greaterThan(cashAmt) && chequeAmt.greaterThan(eftAmt)) {
        primaryMethod = 'cheque'
      }

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          amountPaid:          newPaid,
          loanDeductionAmount: newLoanDeduction,
          paymentMethod:       primaryMethod,
          splitPayments: {
            cash:   cashAmt.toFixed(2),
            eft:    eftAmt.toFixed(2),
            cheque: chequeAmt.toFixed(2),
            loan:   loanAmt.toFixed(2),
          },
          ...(isFullySettled ? { status: 'completed' } : {}),
        },
      })

      // Create Payment records for each method (for cash-up tracking)
      const today = new Date()
      const prefix = `PAY-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

      const payments: Array<{ method: 'cash' | 'eft' | 'cheque'; amount: Decimal }> = []
      if (cashAmt.greaterThan(0))   payments.push({ method: 'cash',   amount: cashAmt })
      if (eftAmt.greaterThan(0))    payments.push({ method: 'eft',    amount: eftAmt })
      if (chequeAmt.greaterThan(0)) payments.push({ method: 'cheque', amount: chequeAmt })

      for (const p of payments) {
        const payCount = await tx.payment.count({ where: { createdAt: { gte: startOfDay } } })
        await tx.payment.create({
          data: {
            refNumber:       `${prefix}-${String(payCount + 1).padStart(4, '0')}`,
            customerId:      purchase.customerId,
            amount:          p.amount,
            paymentMethod:   p.method,
            notes:           `Split payment for ${purchase.refNumber} (${p.method})`,
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

  const keys = action.add
    ? [...(purchase.photoR2Keys ?? []), action.add]
    : (purchase.photoR2Keys ?? []).filter((k) => k !== action.remove)

  const updated = await prisma.purchase.update({
    where:  { id },
    data:   { photoR2Keys: keys },
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
    ...(opts?.paymentMethod && { paymentMethod: opts.paymentMethod as 'cash' | 'eft' | 'cheque' }),
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

  const [rawPurchases, total] = await Promise.all([
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
  ])

  const purchases = rawPurchases.map((p) => {
    const total = new Decimal(p.totalAmount.toString())
    // Persisted header VAT wins; legacy rows (null) derive from the inclusive total
    const vatAmount = purchaseHeaderVat(p, p.customer.zeroRated)
    const subTotal = total.minus(vatAmount).toDecimalPlaces(2)
    return { ...p, subTotal: subTotal.toFixed(2), vatAmount: vatAmount.toFixed(2) }
  })

  return { purchases, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}
