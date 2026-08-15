/**
 * Purchases report builders.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { purchaseLineAmounts } from '@/lib/utils/vat'
import { ciContains, decodeJsonField } from '@/lib/db/queryHelpers'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import { formatDateSAST, formatTimeSAST } from '@/lib/reports/format'
import type { ReportDocument, ReportGroup, ReportMeta, ReportRow } from '@/lib/reports/types'
import type {
  PurchasesByProductCategoryParams,
  PurchasesDailyParams,
  PurchasesSupplierStatementParams,
  PurchasesPerProductDayParams,
  PurchasesAverageCostParams,
  PurchasesSplitPaymentsParams,
  PurchasesByIdSearchParams,
  TopSellersParams,
} from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

function customerBandName(c: { firstName: string; lastName: string; companyName?: string | null }): string {
  return (c.companyName?.trim() || `${c.firstName} ${c.lastName}`).toUpperCase()
}

function purchaseStatusLabel(p: { status: string; amountPaid: unknown; loanDeductionAmount?: unknown }): string {
  if (p.status === 'completed') return 'PAID'
  if (p.status === 'pending') {
    // A pending purchase can be partially settled via a loan deduction
    // alone (no amountPaid yet) — amountPaid-only ignores that and shows
    // UNPAID even though part of the balance is already accounted for.
    const settled = new Decimal(String(p.amountPaid ?? 0)).plus(String(p.loanDeductionAmount ?? 0))
    return settled.greaterThan(0) ? 'PARTIAL' : 'UNPAID'
  }
  return p.status.toUpperCase()
}

function paymentMethodLabel(p: { paymentMethod: string; splitPayments: unknown; loanDeductionAmount?: unknown }): string {
  if (p.splitPayments) return 'Split'
  // A directly-completed purchase can still carry a partial loan deduction
  // (createPurchase accepts one independent of status) — paymentMethod
  // alone would then silently hide that part of it was never cash/EFT.
  if (new Decimal(String(p.loanDeductionAmount ?? 0)).greaterThan(0)) {
    return `${p.paymentMethod.toUpperCase()} + LOAN`
  }
  return p.paymentMethod.toUpperCase()
}

interface PurchaseSplitLegs {
  cash: string
  eft: string
  loan: string
}

function purchaseSplitLegs(splitPayments: unknown): PurchaseSplitLegs {
  return decodeJsonField<PurchaseSplitLegs>(splitPayments)
}

// Legacy account-category band names (CASUALS / DEALERS 1 / DEALERS 3 …)
const DEALER_CATEGORY_BANDS: Record<string, string> = {
  casual: 'CASUALS',
  dealer_1: 'DEALERS 1',
  dealer_2: 'DEALERS 2',
  dealer_3: 'DEALERS 3',
}

const ACCOUNT_CATEGORY_ORDER = ['CASUALS', 'DEALERS 1', 'DEALERS 2', 'DEALERS 3']
const UNCATEGORISED = 'UNCATEGORISED'

function accountCategoryBand(customer: {
  dealerCategory: string | null
  customerType: string
}): string {
  if (customer.dealerCategory) {
    return DEALER_CATEGORY_BANDS[customer.dealerCategory] ?? UNCATEGORISED
  }
  return customer.customerType === 'casual' ? 'CASUALS' : UNCATEGORISED
}

/**
 * Purchases per Product Summary per Account Category (legacy
 * purch_products_sum_acccat): account category → top product category →
 * subcategory → product, with mass/value/VAT subtotals at every level.
 */
export async function buildPurchasesByProductCategory(
  params: PurchasesByProductCategoryParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const byProductCategoryArgs = {
    where: {
      purchase: {
        status: 'completed',
        createdAt: { gte: start, lte: end },
        ...(params.dealerCategory
          ? { customer: { dealerCategory: params.dealerCategory } }
          : {}),
      },
    },
    select: {
      quantity: true,
      lineTotal: true,
      vatAmount: true,
      product: {
        select: {
          code: true,
          name: true,
          category: true,
          categoryRef: { select: { name: true, parent: { select: { name: true } } } },
        },
      },
      purchase: {
        select: {
          customer: {
            select: { dealerCategory: true, customerType: true, zeroRated: true },
          },
        },
      },
    },
  } satisfies Prisma.PurchaseLineFindManyArgs

  const lines = await prisma.purchaseLine.findMany(byProductCategoryArgs)

  // See police.ts's queryCopperPurchases for why this goes through
  // GetPayload explicitly rather than `(typeof lines)[number]`.
  type Line = Prisma.PurchaseLineGetPayload<{ select: typeof byProductCategoryArgs.select }>

  // Era-aware sub/VAT/grand split — legacy rows carry VAT inside lineTotal,
  // new rows carry it on top (see purchaseLineAmounts)
  const amountsOf = (l: Line) => purchaseLineAmounts(l, l.purchase.customer.zeroRated)
  const topCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent?.name ?? l.product.categoryRef?.name ?? l.product.category).toUpperCase()
  const subCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent ? l.product.categoryRef.name : topCategoryOf(l)).toUpperCase()

  const { groups, grandTotal } = groupRows(lines, {
    groups: [
      {
        label: (l) => accountCategoryBand(l.purchase.customer),
        order: ACCOUNT_CATEGORY_ORDER,
        sortLast: [UNCATEGORISED],
      },
      { label: topCategoryOf },
      { label: subCategoryOf, collapseIfSameAsParent: true },
    ],
    row: {
      key: (l) => l.product.code,
      build: (items, totals) => {
        const mass = totals.mass!
        const grand = totals.grandTotal!
        return {
          code: items[0]!.product.code,
          name: items[0]!.product.name,
          avgPrice: mass.isZero() ? null : grand.div(mass).toFixed(2),
          mass: mass.toFixed(3),
          subTotal: totals.subTotal!.toFixed(2),
          vat: totals.vat!.toFixed(2),
          grandTotal: grand.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.product.name,
    },
    measures: {
      mass: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => amountsOf(l).subTotal,
      vat: (l) => amountsOf(l).vat,
      grandTotal: (l) => amountsOf(l).grandTotal,
    },
    formatTotals: (t) => ({
      mass: t.mass!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'purchases-by-product-category',
    title: 'Purchases per Product Summary per Account Category',
    pdfStyle: 'ledger',
    params: {
      from: params.from,
      to: params.to,
      ...(params.dealerCategory ? { filters: { dealerCategory: params.dealerCategory } } : {}),
    },
    columns: [
      { key: 'code', label: 'Code', width: 0.1, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.26, format: 'text', excelWidth: 28 },
      { key: 'avgPrice', label: 'Price Incl.', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'mass', label: 'Mass', width: 0.12, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'subTotal', label: 'Sub Total', width: 0.13, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'vat', label: 'VAT', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'grandTotal', label: 'Grand Total', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

/**
 * Daily Purchases Report (legacy daily_purchases): supplier → ticket (band
 * meta shows time/status/method) → product lines, with totals per ticket,
 * per supplier, and a report grand total.
 */
export async function buildPurchasesDaily(
  params: PurchasesDailyParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const supplierStatementArgs = {
    where: {
      purchase: {
        status: { in: ['completed', 'pending'] },
        createdAt: { gte: start, lte: end },
        ...(params.customerId ? { customerId: params.customerId } : {}),
      },
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      vatAmount: true,
      product: { select: { code: true, name: true } },
      purchase: {
        select: {
          refNumber: true,
          createdAt: true,
          status: true,
          amountPaid: true,
          loanDeductionAmount: true,
          paymentMethod: true,
          splitPayments: true,
          customer: {
            select: { firstName: true, lastName: true, companyName: true, zeroRated: true },
          },
        },
      },
    },
  } satisfies Prisma.PurchaseLineFindManyArgs

  const lines = await prisma.purchaseLine.findMany(supplierStatementArgs)

  type Line = Prisma.PurchaseLineGetPayload<{ select: typeof supplierStatementArgs.select }>
  const amountsOf = (l: Line) => purchaseLineAmounts(l, l.purchase.customer.zeroRated)

  const { groups, grandTotal } = groupRows(lines, {
    groups: [
      { label: (l) => customerBandName(l.purchase.customer) },
      {
        label: (l) => `Ticket ${l.purchase.refNumber}`,
        meta: (l) =>
          `${formatDateSAST(l.purchase.createdAt.toISOString())} ${formatTimeSAST(l.purchase.createdAt.toISOString())}  ·  ${purchaseStatusLabel(l.purchase)}  ·  ${paymentMethodLabel(l.purchase)}`,
      },
    ],
    row: {
      key: (l) => l.id,
      build: (items) => {
        const l = items[0]!
        const a = amountsOf(l)
        return {
          code: l.product.code,
          name: l.product.name,
          price: new Decimal(l.unitPrice.toString()).toFixed(2),
          qty: new Decimal(l.quantity.toString()).toFixed(3),
          subTotal: a.subTotal.toFixed(2),
          vat: a.vat.toFixed(2),
          grandTotal: a.grandTotal.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.product.name,
    },
    measures: {
      qty: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => amountsOf(l).subTotal,
      vat: (l) => amountsOf(l).vat,
      grandTotal: (l) => amountsOf(l).grandTotal,
    },
    formatTotals: (t) => ({
      qty: t.qty!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'purchases-daily',
    title: 'Daily Purchases Report',
    pdfStyle: 'ledger',
    params: {
      from: params.from,
      to: params.to,
      ...(params.customerId ? { filters: { customerId: params.customerId } } : {}),
    },
    columns: [
      { key: 'code', label: 'Code', width: 0.1, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.26, format: 'text', excelWidth: 28 },
      { key: 'price', label: 'Price', width: 0.12, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'qty', label: 'Qty', width: 0.12, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'subTotal', label: 'Sub Total', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'vat', label: 'VAT', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'grandTotal', label: 'Grand Total', width: 0.15, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

/**
 * Paid Purchases per Supplier Statement (legacy purch_stat_cust_sum):
 * one supplier → product → transaction lines with weighbridge columns
 * (WB Full / WB Empty / Nett Mass), totals per product and overall.
 */
export async function buildPurchasesSupplierStatement(
  params: PurchasesSupplierStatementParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const customer = await prisma.customer.findUnique({
    where: { id: params.customerId },
    select: { firstName: true, lastName: true, companyName: true, zeroRated: true },
  })
  if (!customer) throw new Error('Supplier not found')

  const perProductDayArgs = {
    where: {
      purchase: {
        status: 'completed',
        customerId: params.customerId,
        createdAt: { gte: start, lte: end },
      },
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      vatAmount: true,
      grossQty: true,
      tareQty: true,
      product: { select: { name: true } },
      purchase: { select: { refNumber: true, createdAt: true } },
    },
  } satisfies Prisma.PurchaseLineFindManyArgs

  const lines = await prisma.purchaseLine.findMany(perProductDayArgs)

  type Line = Prisma.PurchaseLineGetPayload<{ select: typeof perProductDayArgs.select }>
  const amountsOf = (l: Line) => purchaseLineAmounts(l, customer.zeroRated)

  const { groups, grandTotal } = groupRows(lines, {
    groups: [{ label: (l) => l.product.name.toUpperCase() }],
    row: {
      key: (l) => l.id,
      build: (items) => {
        const l = items[0]!
        const a = amountsOf(l)
        return {
          date: l.purchase.createdAt.toISOString(),
          ref: l.purchase.refNumber,
          price: new Decimal(l.unitPrice.toString()).toFixed(2),
          wbFull: l.grossQty ? new Decimal(l.grossQty.toString()).toFixed(3) : null,
          wbEmpty: l.tareQty ? new Decimal(l.tareQty.toString()).toFixed(3) : null,
          mass: new Decimal(l.quantity.toString()).toFixed(3),
          subTotal: a.subTotal.toFixed(2),
          vat: a.vat.toFixed(2),
          grandTotal: a.grandTotal.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.purchase.createdAt.toISOString(),
    },
    measures: {
      mass: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => amountsOf(l).subTotal,
      vat: (l) => amountsOf(l).vat,
      grandTotal: (l) => amountsOf(l).grandTotal,
    },
    formatTotals: (t) => ({
      mass: t.mass!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'purchases-supplier-statement',
    title: 'Paid Purchases per Supplier Statement',
    pdfStyle: 'ledger',
    subtitle: `Supplier: ${customerBandName(customer)}`,
    params: { from: params.from, to: params.to, filters: { customerId: params.customerId } },
    columns: [
      { key: 'date', label: 'Date', width: 0.105, format: 'date', excelWidth: 12 },
      { key: 'ref', label: 'Ref', width: 0.155, format: 'text', excelWidth: 18 },
      { key: 'price', label: 'Price Incl', width: 0.095, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'wbFull', label: 'WB Full', width: 0.095, align: 'right', format: 'mass', excelWidth: 10 },
      { key: 'wbEmpty', label: 'WB Empty', width: 0.095, align: 'right', format: 'mass', excelWidth: 10 },
      { key: 'mass', label: 'Nett Mass', width: 0.105, align: 'right', format: 'mass', excelWidth: 11 },
      { key: 'subTotal', label: 'Sub Total', width: 0.125, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'vat', label: 'VAT', width: 0.085, align: 'right', format: 'money', excelWidth: 11 },
      { key: 'grandTotal', label: 'Grand Total', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

/**
 * Purchases per Product per Day (legacy purch_prod_days): product category →
 * product (code + name band) → chronological transaction lines, totals per
 * product, per category, and overall.
 */
export async function buildPurchasesPerProductDay(
  params: PurchasesPerProductDayParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const dailyArgs = {
    where: {
      purchase: { status: 'completed', createdAt: { gte: start, lte: end } },
      ...(params.productId ? { productId: params.productId } : {}),
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      vatAmount: true,
      product: {
        select: {
          code: true,
          name: true,
          category: true,
          categoryRef: { select: { name: true, parent: { select: { name: true } } } },
        },
      },
      purchase: {
        select: {
          refNumber: true,
          createdAt: true,
          customer: {
            select: { firstName: true, lastName: true, companyName: true, zeroRated: true },
          },
        },
      },
    },
  } satisfies Prisma.PurchaseLineFindManyArgs

  const lines = await prisma.purchaseLine.findMany(dailyArgs)

  type Line = Prisma.PurchaseLineGetPayload<{ select: typeof dailyArgs.select }>
  const amountsOf = (l: Line) => purchaseLineAmounts(l, l.purchase.customer.zeroRated)
  const topCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent?.name ?? l.product.categoryRef?.name ?? l.product.category).toUpperCase()

  const { groups, grandTotal } = groupRows(lines, {
    groups: [
      { label: topCategoryOf },
      { label: (l) => `${l.product.code}  ${l.product.name}` },
    ],
    row: {
      key: (l) => l.id,
      build: (items) => {
        const l = items[0]!
        const a = amountsOf(l)
        return {
          date: l.purchase.createdAt.toISOString(),
          ref: l.purchase.refNumber,
          supplier: customerBandName(l.purchase.customer),
          price: new Decimal(l.unitPrice.toString()).toFixed(2),
          qty: new Decimal(l.quantity.toString()).toFixed(3),
          subTotal: a.subTotal.toFixed(2),
          vat: a.vat.toFixed(2),
          grandTotal: a.grandTotal.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.purchase.createdAt.toISOString(),
    },
    measures: {
      qty: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => amountsOf(l).subTotal,
      vat: (l) => amountsOf(l).vat,
      grandTotal: (l) => amountsOf(l).grandTotal,
    },
    formatTotals: (t) => ({
      qty: t.qty!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'purchases-per-product-day',
    title: 'Purchases per Product per Day',
    pdfStyle: 'ledger',
    params: {
      from: params.from,
      to: params.to,
      ...(params.productId ? { filters: { productId: params.productId } } : {}),
    },
    columns: [
      { key: 'date', label: 'Date', width: 0.155, format: 'datetime', excelWidth: 16 },
      { key: 'ref', label: 'Trans No.', width: 0.155, format: 'text', excelWidth: 18 },
      { key: 'supplier', label: 'Company', width: 0.145, format: 'text', excelWidth: 24 },
      { key: 'price', label: 'Price Incl.', width: 0.095, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'qty', label: 'Qty', width: 0.095, align: 'right', format: 'mass', excelWidth: 10 },
      { key: 'subTotal', label: 'Sub Total', width: 0.125, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'vat', label: 'VAT', width: 0.09, align: 'right', format: 'money', excelWidth: 11 },
      { key: 'grandTotal', label: 'Grand Total', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

/**
 * Purchase Average Cost Report: every product actually purchased in the
 * period, one flat row each (no category grouping) — with the quantity-
 * weighted average purchase price across every supplier who sold it
 * (avgPrice = grandTotal / mass, not a simple average of unit prices).
 */
export async function buildPurchasesAverageCost(
  params: PurchasesAverageCostParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const averageCostArgs = {
    where: {
      purchase: { status: 'completed', createdAt: { gte: start, lte: end } },
      ...(params.productId ? { productId: params.productId } : {}),
    },
    select: {
      quantity: true,
      lineTotal: true,
      vatAmount: true,
      product: { select: { code: true, name: true } },
      purchase: { select: { customer: { select: { zeroRated: true } } } },
    },
  } satisfies Prisma.PurchaseLineFindManyArgs

  const lines = await prisma.purchaseLine.findMany(averageCostArgs)

  type Line = Prisma.PurchaseLineGetPayload<{ select: typeof averageCostArgs.select }>
  const amountsOf = (l: Line) => purchaseLineAmounts(l, l.purchase.customer.zeroRated)

  const { groups, grandTotal } = groupRows(lines, {
    groups: [],
    row: {
      key: (l) => l.product.code,
      build: (items, totals) => {
        const mass = totals.mass!
        const grand = totals.grandTotal!
        return {
          code: items[0]!.product.code,
          name: items[0]!.product.name,
          avgPrice: mass.isZero() ? null : grand.div(mass).toFixed(2),
          mass: mass.toFixed(3),
          subTotal: totals.subTotal!.toFixed(2),
          vat: totals.vat!.toFixed(2),
          grandTotal: grand.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.product.name,
    },
    measures: {
      mass: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => amountsOf(l).subTotal,
      vat: (l) => amountsOf(l).vat,
      grandTotal: (l) => amountsOf(l).grandTotal,
    },
    formatTotals: (t) => ({
      mass: t.mass!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'purchases-average-cost',
    title: 'Purchase Average Cost Report',
    params: {
      from: params.from,
      to: params.to,
      ...(params.productId ? { filters: { productId: params.productId } } : {}),
    },
    columns: [
      { key: 'code', label: 'Code', width: 0.1, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.26, format: 'text', excelWidth: 28 },
      { key: 'avgPrice', label: 'Avg Price Incl.', width: 0.14, align: 'right', format: 'money', excelWidth: 15 },
      { key: 'mass', label: 'Mass', width: 0.12, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'subTotal', label: 'Sub Total', width: 0.13, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'vat', label: 'VAT', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'grandTotal', label: 'Grand Total', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

/**
 * Purchases — Split Payments: every purchase settled by a cash/EFT/loan
 * split, grouped by supplier, with the three legs broken into their own
 * columns instead of one collapsed "Split" payment-method label.
 */
export async function buildPurchasesSplitPayments(
  params: PurchasesSplitPaymentsParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const splitPaymentArgs = {
    where: {
      createdAt: { gte: start, lte: end },
      splitPayments: { not: Prisma.DbNull },
      // voidPurchase never clears splitPayments on void — a voided purchase
      // still has this JSON populated, so it must be excluded explicitly.
      status: { not: 'voided' },
      ...(params.customerId ? { customerId: params.customerId } : {}),
    },
    select: {
      refNumber: true,
      createdAt: true,
      splitPayments: true,
      // Only the legs from the split-payment call itself are in
      // splitPayments — a loan deduction already applied at creation
      // (before this purchase was ever settled) isn't in that JSON at all.
      // totalAmount is the ground truth; loan is derived as whatever's left
      // after cash+eft rather than trusted from the JSON.
      totalAmount: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
    },
  } satisfies Prisma.PurchaseFindManyArgs

  const purchases = await prisma.purchase.findMany(splitPaymentArgs)

  const legsOf = (p: (typeof purchases)[number]) => {
    const legs = purchaseSplitLegs(p.splitPayments)
    const cash = new Decimal(legs.cash || '0')
    const eft = new Decimal(legs.eft || '0')
    const total = new Decimal(p.totalAmount.toString())
    // Loan = whatever the cash/eft legs don't cover, so a loan deduction
    // applied before this settlement (not present in the JSON) still shows
    // up and the row always reconciles to the purchase's real total.
    const loan = total.minus(cash).minus(eft)
    return { cash, eft, loan, total }
  }

  const { groups, grandTotal } = groupRows(purchases, {
    groups: [{ label: (p) => customerBandName(p.customer) }],
    row: {
      key: (p) => p.refNumber,
      build: (items) => {
        const p = items[0]!
        const legs = legsOf(p)
        return {
          ticket: p.refNumber,
          date: p.createdAt.toISOString(),
          cash: legs.cash.toFixed(2),
          eft: legs.eft.toFixed(2),
          loan: legs.loan.toFixed(2),
          total: legs.total.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.createdAt.toISOString(),
    },
    measures: {
      cash: (p) => legsOf(p).cash,
      eft: (p) => legsOf(p).eft,
      loan: (p) => legsOf(p).loan,
      total: (p) => legsOf(p).total,
    },
    formatTotals: (t) => ({
      cash: t.cash!.toFixed(2),
      eft: t.eft!.toFixed(2),
      loan: t.loan!.toFixed(2),
      total: t.total!.toFixed(2),
    }),
  })

  return {
    reportId: 'purchases-split-payments',
    title: 'Purchases — Split Payments',
    params: {
      from: params.from,
      to: params.to,
      ...(params.customerId ? { filters: { customerId: params.customerId } } : {}),
    },
    columns: [
      { key: 'ticket', label: 'Ticket', width: 0.16, format: 'text', excelWidth: 16 },
      { key: 'date', label: 'Date', width: 0.19, format: 'datetime', excelWidth: 18 },
      { key: 'cash', label: 'Cash', width: 0.16, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'eft', label: 'EFT', width: 0.16, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'loan', label: 'Loan', width: 0.16, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'total', label: 'Total', width: 0.17, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

/**
 * Purchases by Casual ID / Purchases by Account ID: search a seller by
 * partial ID number and/or a transaction by partial reference number, scoped
 * to one customerType — same shape as the Daily Purchases Report.
 */
async function buildPurchasesByIdSearchCore(
  params: PurchasesByIdSearchParams,
  meta: MetaBase,
  customerType: 'casual' | 'account',
  reportId: string,
  title: string
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const byIdSearchArgs = {
    where: {
      purchase: {
        status: { in: ['completed', 'pending'] },
        createdAt: { gte: start, lte: end },
        ...(params.customerId ? { customerId: params.customerId } : {}),
        ...(params.refNumber ? { refNumber: ciContains(params.refNumber) } : {}),
        customer: {
          customerType,
          ...(params.idNumber ? { idNumber: ciContains(params.idNumber) } : {}),
        },
      },
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      vatAmount: true,
      product: { select: { code: true, name: true } },
      purchase: {
        select: {
          refNumber: true,
          createdAt: true,
          status: true,
          amountPaid: true,
          loanDeductionAmount: true,
          paymentMethod: true,
          splitPayments: true,
          customer: {
            select: { firstName: true, lastName: true, companyName: true, zeroRated: true },
          },
        },
      },
    },
  } satisfies Prisma.PurchaseLineFindManyArgs

  const lines = await prisma.purchaseLine.findMany(byIdSearchArgs)

  type Line = Prisma.PurchaseLineGetPayload<{ select: typeof byIdSearchArgs.select }>
  const amountsOf = (l: Line) => purchaseLineAmounts(l, l.purchase.customer.zeroRated)

  const { groups, grandTotal } = groupRows(lines, {
    groups: [
      { label: (l) => customerBandName(l.purchase.customer) },
      {
        label: (l) => `Ticket ${l.purchase.refNumber}`,
        meta: (l) =>
          `${formatDateSAST(l.purchase.createdAt.toISOString())} ${formatTimeSAST(l.purchase.createdAt.toISOString())}  ·  ${purchaseStatusLabel(l.purchase)}  ·  ${paymentMethodLabel(l.purchase)}`,
      },
    ],
    row: {
      key: (l) => l.id,
      build: (items) => {
        const l = items[0]!
        const a = amountsOf(l)
        return {
          code: l.product.code,
          name: l.product.name,
          price: new Decimal(l.unitPrice.toString()).toFixed(2),
          qty: new Decimal(l.quantity.toString()).toFixed(3),
          subTotal: a.subTotal.toFixed(2),
          vat: a.vat.toFixed(2),
          grandTotal: a.grandTotal.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.product.name,
    },
    measures: {
      qty: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => amountsOf(l).subTotal,
      vat: (l) => amountsOf(l).vat,
      grandTotal: (l) => amountsOf(l).grandTotal,
    },
    formatTotals: (t) => ({
      qty: t.qty!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  const filters: Record<string, string> = {}
  if (params.idNumber) filters.idNumber = params.idNumber
  if (params.refNumber) filters.refNumber = params.refNumber
  if (params.customerId) filters.customerId = params.customerId

  return {
    reportId,
    title,
    pdfStyle: 'ledger',
    params: {
      from: params.from,
      to: params.to,
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
    },
    columns: [
      { key: 'code', label: 'Code', width: 0.1, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.26, format: 'text', excelWidth: 28 },
      { key: 'price', label: 'Price', width: 0.12, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'qty', label: 'Qty', width: 0.12, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'subTotal', label: 'Sub Total', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'vat', label: 'VAT', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'grandTotal', label: 'Grand Total', width: 0.15, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

export function buildPurchasesByCasualId(
  params: PurchasesByIdSearchParams,
  meta: MetaBase
): Promise<ReportDocument> {
  return buildPurchasesByIdSearchCore(params, meta, 'casual', 'purchases-by-casual-id', 'Purchases by Casual ID')
}

export function buildPurchasesByAccountId(
  params: PurchasesByIdSearchParams,
  meta: MetaBase
): Promise<ReportDocument> {
  return buildPurchasesByIdSearchCore(params, meta, 'account', 'purchases-by-account-id', 'Purchases by Account ID')
}

interface TopSellerAgg {
  name: string
  idNumber: string | null
  weight: Decimal
  cost: Decimal
  purchaseIds: Set<string>
}

/**
 * Top 10 Sellers by Category (Ferrous / Non-Ferrous): two independently
 * ranked lists (by total weight brought in) in one report, scoped to either
 * casual or account sellers. A seller can appear in both lists if they sold
 * both categories in the period.
 */
export async function buildTopSellersByCategory(
  params: TopSellersParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const topSellersArgs = {
    where: {
      purchase: {
        status: 'completed',
        createdAt: { gte: start, lte: end },
        customer: { customerType: params.customerType },
      },
    },
    select: {
      quantity: true,
      lineTotal: true,
      vatAmount: true,
      product: {
        select: {
          category: true,
          categoryRef: { select: { name: true, parent: { select: { name: true } } } },
        },
      },
      purchase: {
        select: {
          id: true,
          customer: {
            select: { id: true, firstName: true, lastName: true, companyName: true, idNumber: true, zeroRated: true },
          },
        },
      },
    },
  } satisfies Prisma.PurchaseLineFindManyArgs

  const lines = await prisma.purchaseLine.findMany(topSellersArgs)

  type Line = Prisma.PurchaseLineGetPayload<{ select: typeof topSellersArgs.select }>
  const amountsOf = (l: Line) => purchaseLineAmounts(l, l.purchase.customer.zeroRated)
  const topCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent?.name ?? l.product.categoryRef?.name ?? l.product.category).toUpperCase()

  // Only "Ferrous" is itself a top-level category in most tenants' trees —
  // Copper, Aluminium, Plastic, etc. are separate top-level siblings, not
  // children of a "Non-Ferrous" parent. So the Non-Ferrous bucket is
  // everything that isn't Ferrous, not a literal "NON-FERROUS" name match.
  function topTenFor(category: 'FERROUS' | 'NON-FERROUS'): TopSellerAgg[] {
    const byCustomer = new Map<string, TopSellerAgg>()
    for (const l of lines) {
      const isFerrous = topCategoryOf(l) === 'FERROUS'
      if (category === 'FERROUS' ? !isFerrous : isFerrous) continue
      const c = l.purchase.customer
      let agg = byCustomer.get(c.id)
      if (!agg) {
        agg = {
          name: c.companyName?.trim() || `${c.firstName} ${c.lastName}`,
          idNumber: c.idNumber,
          weight: new Decimal(0),
          cost: new Decimal(0),
          purchaseIds: new Set(),
        }
        byCustomer.set(c.id, agg)
      }
      agg.weight = agg.weight.plus(new Decimal(l.quantity.toString()))
      agg.cost = agg.cost.plus(amountsOf(l).grandTotal)
      agg.purchaseIds.add(l.purchase.id)
    }
    return Array.from(byCustomer.values())
      .sort((a, b) => b.weight.comparedTo(a.weight))
      .slice(0, 10)
  }

  function toRows(list: TopSellerAgg[]): ReportRow[] {
    return list.map((a, i) => ({
      cells: {
        rank: String(i + 1),
        name: a.name,
        idNumber: a.idNumber,
        transactions: String(a.purchaseIds.size),
        weight: a.weight.toFixed(3),
        cost: a.cost.toFixed(2),
        avgPrice: a.weight.isZero() ? null : a.cost.div(a.weight).toFixed(2),
      },
    }))
  }

  const sumCells = (rows: ReportRow[], key: 'weight' | 'cost') =>
    rows.reduce((acc, r) => acc.plus(new Decimal(r.cells[key] ?? '0')), new Decimal(0))

  const ferrousRows = toRows(topTenFor('FERROUS'))
  const nonFerrousRows = toRows(topTenFor('NON-FERROUS'))

  const groups: ReportGroup[] = [
    {
      level: 0,
      label: 'FERROUS — TOP 10',
      rows: ferrousRows,
      subtotal: { weight: sumCells(ferrousRows, 'weight').toFixed(3), cost: sumCells(ferrousRows, 'cost').toFixed(2) },
    },
    {
      level: 0,
      label: 'NON-FERROUS — TOP 10',
      rows: nonFerrousRows,
      subtotal: { weight: sumCells(nonFerrousRows, 'weight').toFixed(3), cost: sumCells(nonFerrousRows, 'cost').toFixed(2) },
    },
  ]

  return {
    reportId: 'top-sellers-by-category',
    title: 'Top 10 Sellers by Category',
    subtitle: `Seller type: ${params.customerType === 'account' ? 'Account' : 'Casual'}  ·  Ranked by total weight`,
    params: { from: params.from, to: params.to, filters: { customerType: params.customerType } },
    columns: [
      { key: 'rank', label: '#', width: 0.05, align: 'right', format: 'int', excelWidth: 5 },
      { key: 'name', label: 'Seller Name', width: 0.24, format: 'text', excelWidth: 26 },
      { key: 'idNumber', label: 'ID Number', width: 0.15, format: 'text', excelWidth: 16 },
      { key: 'transactions', label: 'Transactions', width: 0.12, align: 'right', format: 'int', excelWidth: 12 },
      { key: 'weight', label: 'Total Weight', width: 0.15, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'cost', label: 'Total Cost', width: 0.15, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'avgPrice', label: 'Avg Price/kg', width: 0.14, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    meta: { ...meta, rowCount: ferrousRows.length + nonFerrousRows.length },
  }
}
