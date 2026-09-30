import { prisma } from '@/lib/db/prisma'
import { resolveTaxInvoiceDate, type TaxInvoiceDateSource } from '@/lib/utils/taxInvoiceDate'

export class TaxInvoiceDocNotFoundError extends Error {}
export class TaxInvoiceDocVoidedError extends Error {
  constructor() { super('A voided document has no tax invoice') }
}
export class TaxInvoiceDateInFutureError extends Error {
  constructor() { super('Tax invoice date cannot be in the future') }
}

export type TaxInvoiceDocKind = 'sale' | 'purchase'

export type TaxInvoiceDateInfo = {
  /** Date the invoice will print. */
  effectiveDate: Date
  source: TaxInvoiceDateSource
  /** Manual override, null when none is set. */
  override: Date | null
}

type DocRow = { id: string; status: string; createdAt: Date; taxInvoiceDate: Date | null }

async function loadDoc(kind: TaxInvoiceDocKind, id: string): Promise<DocRow> {
  const select = { id: true, status: true, createdAt: true, taxInvoiceDate: true } as const
  const doc = kind === 'sale'
    ? await prisma.sale.findUnique({ where: { id }, select })
    : await prisma.purchase.findUnique({ where: { id }, select })
  if (!doc) throw new TaxInvoiceDocNotFoundError()
  return doc
}

async function lastPaymentAt(kind: TaxInvoiceDocKind, id: string): Promise<Date | null> {
  const payment = await prisma.payment.findFirst({
    where: { ...(kind === 'sale' ? { saleId: id } : { purchaseId: id }), voidedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return payment?.createdAt ?? null
}

export async function getTaxInvoiceDateInfo(kind: TaxInvoiceDocKind, id: string): Promise<TaxInvoiceDateInfo> {
  const doc = await loadDoc(kind, id)
  const { date, source } = resolveTaxInvoiceDate({
    override: doc.taxInvoiceDate,
    lastPaymentAt: doc.taxInvoiceDate ? null : await lastPaymentAt(kind, id),
    createdAt: doc.createdAt,
  })
  return { effectiveDate: date, source, override: doc.taxInvoiceDate }
}

/** Sets (or, with null, clears) the manual tax invoice date. The audit middleware records the update. */
export async function setTaxInvoiceDate(kind: TaxInvoiceDocKind, id: string, date: Date | null) {
  const doc = await loadDoc(kind, id)
  if (doc.status === 'voided') throw new TaxInvoiceDocVoidedError()
  if (date && date.getTime() > Date.now() + 60_000) throw new TaxInvoiceDateInFutureError()

  if (kind === 'sale') await prisma.sale.update({ where: { id }, data: { taxInvoiceDate: date } })
  else await prisma.purchase.update({ where: { id }, data: { taxInvoiceDate: date } })
  return getTaxInvoiceDateInfo(kind, id)
}
