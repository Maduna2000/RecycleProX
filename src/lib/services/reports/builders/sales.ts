/**
 * Sales report builders — mirrors of the purchases set for the outgoing side.
 *
 * Sale VAT: the header vatAmount is authoritative (one uniform rate per
 * sale), so a line's share is exact: lineTotal × 0.15 when the sale carried
 * VAT (see saleLineVat). Sale.totalAmount = Σ lineTotal + vatAmount.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { saleLineVat } from '@/lib/utils/vat'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import { formatDateSAST, formatTimeSAST } from '@/lib/reports/format'
import type { ReportDocument, ReportMeta } from '@/lib/reports/types'
import type {
  SalesDailyParams,
  SalesByProductParams,
  SalesByCustomerParams,
} from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

function buyerBandName(sale: {
  customer: { firstName: string; lastName: string; companyName: string | null } | null
  buyerName: string | null
}): string {
  if (sale.customer) {
    return (sale.customer.companyName?.trim() || `${sale.customer.firstName} ${sale.customer.lastName}`).toUpperCase()
  }
  return (sale.buyerName?.trim() || 'WALK-IN').toUpperCase()
}

function saleStatusLabel(s: { status: string; amountPaid: unknown }): string {
  if (s.status === 'completed') return 'PAID'
  if (s.status === 'pending') {
    return new Decimal(String(s.amountPaid ?? 0)).greaterThan(0) ? 'PARTIAL' : 'UNPAID'
  }
  return s.status.toUpperCase()
}

/**
 * Daily Sales Report: buyer → ticket (band meta shows time/status/method) →
 * product lines, totals per ticket, per buyer, and overall.
 */
export async function buildSalesDaily(
  params: SalesDailyParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const lines = await prisma.saleLine.findMany({
    where: {
      sale: {
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
      product: { select: { code: true, name: true } },
      sale: {
        select: {
          refNumber: true,
          createdAt: true,
          status: true,
          amountPaid: true,
          paymentMethod: true,
          vatAmount: true,
          buyerName: true,
          customer: { select: { firstName: true, lastName: true, companyName: true } },
        },
      },
    },
  })

  type Line = (typeof lines)[number]
  const saleHasVat = (l: Line) => new Decimal(l.sale.vatAmount.toString()).greaterThan(0)
  const vatOf = (l: Line) => saleLineVat(l, saleHasVat(l))
  const grandOf = (l: Line) => new Decimal(l.lineTotal.toString()).plus(vatOf(l))

  const { groups, grandTotal } = groupRows(lines, {
    groups: [
      { label: (l) => buyerBandName(l.sale) },
      {
        label: (l) => `Ticket ${l.sale.refNumber}`,
        meta: (l) =>
          `${formatDateSAST(l.sale.createdAt.toISOString())} ${formatTimeSAST(l.sale.createdAt.toISOString())}  ·  ${saleStatusLabel(l.sale)}  ·  ${l.sale.paymentMethod.toUpperCase()}`,
      },
    ],
    row: {
      key: (l) => l.id,
      build: (items) => {
        const l = items[0]!
        return {
          code: l.product.code,
          name: l.product.name,
          price: new Decimal(l.unitPrice.toString()).toFixed(2),
          qty: new Decimal(l.quantity.toString()).toFixed(3),
          subTotal: new Decimal(l.lineTotal.toString()).toFixed(2),
          vat: vatOf(l).toFixed(2),
          grandTotal: grandOf(l).toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.product.name,
    },
    measures: {
      qty: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => new Decimal(l.lineTotal.toString()),
      vat: vatOf,
      grandTotal: grandOf,
    },
    formatTotals: (t) => ({
      qty: t.qty!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'sales-daily',
    title: 'Daily Sales Report',
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
 * Sales per Product Summary: product category → subcategory → product rows
 * (weighted avg price, mass, sub total, VAT, grand total) with subtotals at
 * every level — the sales mirror of the purchases pilot, without the
 * account-category dimension.
 */
export async function buildSalesByProduct(
  params: SalesByProductParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const lines = await prisma.saleLine.findMany({
    where: {
      sale: { status: 'completed', createdAt: { gte: start, lte: end } },
    },
    select: {
      quantity: true,
      lineTotal: true,
      product: {
        select: {
          code: true,
          name: true,
          category: true,
          categoryRef: { select: { name: true, parent: { select: { name: true } } } },
        },
      },
      sale: { select: { vatAmount: true } },
    },
  })

  type Line = (typeof lines)[number]
  const vatOf = (l: Line) => saleLineVat(l, new Decimal(l.sale.vatAmount.toString()).greaterThan(0))
  const grandOf = (l: Line) => new Decimal(l.lineTotal.toString()).plus(vatOf(l))
  const topCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent?.name ?? l.product.categoryRef?.name ?? l.product.category).toUpperCase()
  const subCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent ? l.product.categoryRef.name : topCategoryOf(l)).toUpperCase()

  const { groups, grandTotal } = groupRows(lines, {
    groups: [
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
      subTotal: (l) => new Decimal(l.lineTotal.toString()),
      vat: vatOf,
      grandTotal: grandOf,
    },
    formatTotals: (t) => ({
      mass: t.mass!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'sales-by-product',
    title: 'Sales per Product Summary',
    params: { from: params.from, to: params.to },
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
 * Sales per Customer: buyer → one row per sale (date, ref, method, sub
 * total, VAT, total, paid, outstanding), totals per buyer and overall.
 */
export async function buildSalesByCustomer(
  params: SalesByCustomerParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: ['completed', 'pending'] },
      createdAt: { gte: start, lte: end },
      ...(params.customerId ? { customerId: params.customerId } : {}),
    },
    select: {
      id: true,
      refNumber: true,
      createdAt: true,
      status: true,
      totalAmount: true,
      vatAmount: true,
      amountPaid: true,
      paymentMethod: true,
      buyerName: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
    },
  })

  type Sale = (typeof sales)[number]
  const totalOf = (s: Sale) => new Decimal(s.totalAmount.toString())
  const vatOf = (s: Sale) => new Decimal(s.vatAmount.toString())
  const paidOf = (s: Sale) =>
    s.amountPaid !== null
      ? new Decimal(s.amountPaid.toString())
      : s.status === 'completed'
        ? totalOf(s)
        : new Decimal(0)
  const outstandingOf = (s: Sale) => Decimal.max(totalOf(s).minus(paidOf(s)), new Decimal(0))

  const { groups, grandTotal } = groupRows(sales, {
    groups: [{ label: buyerBandName }],
    row: {
      key: (s) => s.id,
      build: (items) => {
        const s = items[0]!
        return {
          date: s.createdAt.toISOString(),
          ref: s.refNumber,
          method: s.paymentMethod.toUpperCase(),
          status: saleStatusLabel(s),
          subTotal: totalOf(s).minus(vatOf(s)).toFixed(2),
          vat: vatOf(s).toFixed(2),
          total: totalOf(s).toFixed(2),
          outstanding: outstandingOf(s).toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.createdAt.toISOString(),
    },
    measures: {
      subTotal: (s) => totalOf(s).minus(vatOf(s)),
      vat: vatOf,
      total: totalOf,
      outstanding: outstandingOf,
    },
    formatTotals: (t) => ({
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      total: t.total!.toFixed(2),
      outstanding: t.outstanding!.toFixed(2),
    }),
  })

  return {
    reportId: 'sales-by-customer',
    title: 'Sales per Customer',
    params: {
      from: params.from,
      to: params.to,
      ...(params.customerId ? { filters: { customerId: params.customerId } } : {}),
    },
    columns: [
      { key: 'date', label: 'Date', width: 0.13, format: 'datetime', excelWidth: 16 },
      { key: 'ref', label: 'Ref', width: 0.1, format: 'text', excelWidth: 10 },
      { key: 'method', label: 'Method', width: 0.1, format: 'text', excelWidth: 10 },
      { key: 'status', label: 'Status', width: 0.1, format: 'text', excelWidth: 10 },
      { key: 'subTotal', label: 'Sub Total', width: 0.14, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'vat', label: 'VAT', width: 0.13, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'total', label: 'Total', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'outstanding', label: 'Outstanding', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}
