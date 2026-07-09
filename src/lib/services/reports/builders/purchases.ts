/**
 * Purchases report builders.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { purchaseLineAmounts } from '@/lib/utils/vat'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import { formatDateSAST, formatTimeSAST } from '@/lib/reports/format'
import type { ReportDocument, ReportMeta } from '@/lib/reports/types'
import type {
  PurchasesByProductCategoryParams,
  PurchasesDailyParams,
  PurchasesSupplierStatementParams,
  PurchasesPerProductDayParams,
  PurchasesByIdSearchParams,
} from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

function customerBandName(c: { firstName: string; lastName: string; companyName?: string | null }): string {
  return (c.companyName?.trim() || `${c.firstName} ${c.lastName}`).toUpperCase()
}

function purchaseStatusLabel(p: { status: string; amountPaid: unknown }): string {
  if (p.status === 'completed') return 'PAID'
  if (p.status === 'pending') {
    return new Decimal(String(p.amountPaid ?? 0)).greaterThan(0) ? 'PARTIAL' : 'UNPAID'
  }
  return p.status.toUpperCase()
}

function paymentMethodLabel(p: { paymentMethod: string; splitPayments: unknown }): string {
  return p.splitPayments ? 'Split' : p.paymentMethod.toUpperCase()
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

  const lines = await prisma.purchaseLine.findMany({
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
  })

  type Line = (typeof lines)[number]

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

  const lines = await prisma.purchaseLine.findMany({
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
          paymentMethod: true,
          splitPayments: true,
          customer: {
            select: { firstName: true, lastName: true, companyName: true, zeroRated: true },
          },
        },
      },
    },
  })

  type Line = (typeof lines)[number]
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

  const lines = await prisma.purchaseLine.findMany({
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
  })

  type Line = (typeof lines)[number]
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

  const lines = await prisma.purchaseLine.findMany({
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
  })

  type Line = (typeof lines)[number]
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

  const lines = await prisma.purchaseLine.findMany({
    where: {
      purchase: {
        status: { in: ['completed', 'pending'] },
        createdAt: { gte: start, lte: end },
        ...(params.customerId ? { customerId: params.customerId } : {}),
        ...(params.refNumber ? { refNumber: { contains: params.refNumber, mode: 'insensitive' } } : {}),
        customer: {
          customerType,
          ...(params.idNumber ? { idNumber: { contains: params.idNumber, mode: 'insensitive' } } : {}),
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
          paymentMethod: true,
          splitPayments: true,
          customer: {
            select: { firstName: true, lastName: true, companyName: true, zeroRated: true },
          },
        },
      },
    },
  })

  type Line = (typeof lines)[number]
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
