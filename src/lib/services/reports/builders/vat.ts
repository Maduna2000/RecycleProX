/**
 * VAT on Tax Invoices — every sale (output VAT) and purchase (input VAT) that
 * carries VAT, dated by its tax-invoice date (manual override → last
 * non-voided payment → created; see resolveTaxInvoiceDate), grouped by
 * document type and customer.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import type { Prisma } from '@prisma/client'
import { purchaseHeaderAmounts } from '@/lib/utils/vat'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { resolveTaxInvoiceDate } from '@/lib/utils/taxInvoiceDate'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import type { ReportDocument, ReportMeta } from '@/lib/reports/types'
import type { VatTaxInvoicesParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

const SALES_BAND = 'SALES — OUTPUT VAT (COLLECTED)'
const PURCHASES_BAND = 'PURCHASES — INPUT VAT (PAID)'

interface InvoiceItem {
  id: string
  kind: 'sale' | 'purchase'
  ref: string
  invoiceDate: Date
  partyName: string
  partyVatNumber: string | null
  status: 'completed' | 'pending'
  subTotal: Decimal
  vat: Decimal
  total: Decimal
}

function customerName(c: { firstName: string; lastName: string; companyName: string | null }): string {
  return (c.companyName?.trim() || `${c.firstName} ${c.lastName}`).toUpperCase()
}

/** Candidate filter: any doc whose tax-invoice date could fall in [start, end]; the exact date is re-checked in memory. */
function dateCandidates(start: Date, end: Date) {
  const range = { gte: start, lte: end }
  return {
    OR: [
      { taxInvoiceDate: range },
      {
        taxInvoiceDate: null,
        OR: [{ createdAt: range }, { payments: { some: { voidedAt: null, createdAt: range } } }],
      },
    ],
  }
}

const lastPaymentSelect = {
  where: { voidedAt: null },
  orderBy: { createdAt: 'desc' as const },
  take: 1,
  select: { createdAt: true },
}

export async function buildVatTaxInvoices(
  params: VatTaxInvoicesParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const inRange = (d: Date) => d >= start && d <= end

  const customerWhere: Prisma.CustomerWhereInput = params.customerType ? { customerType: params.customerType } : {}
  const wantSales = params.docType !== 'purchases'
  const wantPurchases = params.docType !== 'sales'

  const [sales, purchases] = await Promise.all([
    wantSales
      ? prisma.sale.findMany({
          where: {
            status: { in: ['completed', 'pending'] },
            vatAmount: { gt: 0 },
            ...dateCandidates(start, end),
            ...(params.customerId ? { customerId: params.customerId } : {}),
            ...(params.customerType ? { customer: customerWhere } : {}),
          },
          select: {
            id: true, refNumber: true, status: true, createdAt: true, taxInvoiceDate: true,
            totalAmount: true, vatAmount: true, buyerName: true,
            customer: { select: { firstName: true, lastName: true, companyName: true, vatNumber: true } },
            payments: lastPaymentSelect,
          },
        })
      : [],
    wantPurchases
      ? prisma.purchase.findMany({
          where: {
            status: { in: ['completed', 'pending'] },
            ...dateCandidates(start, end),
            customer: { ...customerWhere, ...(params.customerId ? { id: params.customerId } : {}) },
          },
          select: {
            id: true, refNumber: true, status: true, createdAt: true, taxInvoiceDate: true,
            totalAmount: true, vatAmount: true,
            customer: { select: { firstName: true, lastName: true, companyName: true, vatNumber: true, zeroRated: true } },
            payments: lastPaymentSelect,
          },
        })
      : [],
  ])

  const items: InvoiceItem[] = []

  for (const s of sales) {
    const { date } = resolveTaxInvoiceDate({
      override: s.taxInvoiceDate,
      lastPaymentAt: s.payments[0]?.createdAt ?? null,
      createdAt: s.createdAt,
    })
    if (!inRange(date)) continue
    const vat = new Decimal(s.vatAmount.toString())
    const total = new Decimal(s.totalAmount.toString())
    items.push({
      id: s.id, kind: 'sale', ref: s.refNumber, invoiceDate: date,
      partyName: s.customer ? customerName(s.customer) : (s.buyerName?.trim().toUpperCase() || 'WALK-IN'),
      partyVatNumber: s.customer?.vatNumber ?? null,
      status: s.status as 'completed' | 'pending',
      subTotal: total.minus(vat), vat, total,
    })
  }

  for (const p of purchases) {
    const { date } = resolveTaxInvoiceDate({
      override: p.taxInvoiceDate,
      lastPaymentAt: p.payments[0]?.createdAt ?? null,
      createdAt: p.createdAt,
    })
    if (!inRange(date)) continue
    const a = purchaseHeaderAmounts(p, p.customer.zeroRated)
    if (!a.vat.greaterThan(0)) continue
    items.push({
      id: p.id, kind: 'purchase', ref: p.refNumber, invoiceDate: date,
      partyName: customerName(p.customer),
      partyVatNumber: p.customer.vatNumber ?? null,
      status: p.status as 'completed' | 'pending',
      subTotal: a.subTotal, vat: a.vat, total: a.grandTotal,
    })
  }

  const { groups, grandTotal } = groupRows(items, {
    groups: [
      { label: (i) => (i.kind === 'sale' ? SALES_BAND : PURCHASES_BAND), order: [SALES_BAND, PURCHASES_BAND] },
      { label: (i) => i.partyName },
    ],
    row: {
      key: (i) => `${i.kind}:${i.id}`,
      build: (rows) => {
        const i = rows[0]!
        return {
          date: i.invoiceDate.toISOString(),
          ref: i.ref,
          vatNumber: i.partyVatNumber,
          status: i.status === 'completed' ? 'PAID' : 'UNPAID/PART',
          subTotal: i.subTotal.toFixed(2),
          vat: i.vat.toFixed(2),
          total: i.total.toFixed(2),
        }
      },
      sortBy: (rows) => rows[0]!.invoiceDate.toISOString(),
    },
    measures: { subTotal: (i) => i.subTotal, vat: (i) => i.vat, total: (i) => i.total },
    formatTotals: (t) => ({ subTotal: t.subTotal!.toFixed(2), vat: t.vat!.toFixed(2), total: t.total!.toFixed(2) }),
  })

  const sumVat = (kind: InvoiceItem['kind']) =>
    items.filter((i) => i.kind === kind).reduce((acc, i) => acc.plus(i.vat), new Decimal(0))
  const output = sumVat('sale')
  const input = sumVat('purchase')

  const filters: Record<string, string> = {}
  if (params.docType) filters.docType = params.docType
  if (params.customerId) filters.customerId = params.customerId
  if (params.customerType) filters.customerType = params.customerType

  return {
    reportId: 'vat-tax-invoices',
    title: 'VAT on Tax Invoices',
    subtitle: 'Invoices dated by tax-invoice date (manual date, else last payment, else created). Voided documents excluded.',
    params: { from: params.from, to: params.to, ...(Object.keys(filters).length ? { filters } : {}) },
    columns: [
      { key: 'date', label: 'Invoice Date', width: 0.15, format: 'date', excelWidth: 13 },
      { key: 'ref', label: 'Ref', width: 0.13, format: 'text', excelWidth: 12 },
      { key: 'vatNumber', label: 'VAT No.', width: 0.14, format: 'text', excelWidth: 14 },
      { key: 'status', label: 'Status', width: 0.12, format: 'text', excelWidth: 12 },
      { key: 'subTotal', label: 'Sub Total', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'vat', label: 'VAT', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'total', label: 'Total', width: 0.16, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    // Output and input VAT are different things — a combined grand total is only meaningful for one document type.
    ...(wantSales !== wantPurchases ? { grandTotal } : {}),
    summary: [
      ...(wantSales ? [{ label: 'Output VAT collected (sales)', value: output.toFixed(2) }] : []),
      ...(wantPurchases ? [{ label: 'Input VAT paid (purchases)', value: input.toFixed(2) }] : []),
      ...(wantSales && wantPurchases
        ? [{ label: 'Net VAT payable (output − input)', value: output.minus(input).toFixed(2), emphasis: true }]
        : []),
    ],
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}
