/**
 * VAT on Tax Invoices report — prisma mocked. Covers tax-invoice dating
 * (override / last payment / created), range filtering, grouping, VAT totals,
 * and the document-type filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const saleFindMany = vi.fn()
const purchaseFindMany = vi.fn()
vi.mock('@/lib/db/prisma', () => ({
  prisma: { sale: { findMany: (a: unknown) => saleFindMany(a) }, purchase: { findMany: (a: unknown) => purchaseFindMany(a) } },
}))

import { buildVatTaxInvoices } from '@/lib/services/reports/builders/vat'
import { REPORT_REGISTRY } from '@/lib/services/reports/registry'

const meta = { generatedAt: '', generatedBy: '', company: { name: '', address: '' }, currencySymbol: 'E' }
const cust = { firstName: 'A', lastName: 'B', companyName: 'Acme', vatNumber: '123' }

const sale = (over: Record<string, unknown>) => ({
  id: 's1', refNumber: 'S-1', status: 'completed', createdAt: new Date('2026-09-10T08:00:00Z'),
  taxInvoiceDate: null, totalAmount: '115.00', vatAmount: '15.00', buyerName: null,
  customer: cust, payments: [], ...over,
})
const purchase = (over: Record<string, unknown>) => ({
  id: 'p1', refNumber: 'P-1', status: 'completed', createdAt: new Date('2026-09-12T08:00:00Z'),
  taxInvoiceDate: null, totalAmount: '230.00', vatAmount: '30.00',
  customer: { ...cust, zeroRated: false }, payments: [], ...over,
})

beforeEach(() => { saleFindMany.mockReset(); purchaseFindMany.mockReset() })

describe('buildVatTaxInvoices', () => {
  it('is registered', () => {
    expect(REPORT_REGISTRY['vat-tax-invoices']).toBeDefined()
  })

  it('totals output and input VAT and nets them', async () => {
    saleFindMany.mockResolvedValue([sale({}), sale({ id: 's2', refNumber: 'S-2' })])
    purchaseFindMany.mockResolvedValue([purchase({})])
    const doc = await buildVatTaxInvoices({ from: '2026-09-01', to: '2026-09-30' }, meta)
    expect(doc.summary!.map((s) => s.value)).toEqual(['30.00', '30.00', '0.00'])
    expect(doc.groups.map((g) => g.label)).toEqual(['SALES — OUTPUT VAT (COLLECTED)', 'PURCHASES — INPUT VAT (PAID)'])
    expect(doc.meta.rowCount).toBe(3)
    expect(doc.grandTotal).toBeUndefined()
  })

  it('dates by last payment, dropping invoices whose payment falls outside the range', async () => {
    saleFindMany.mockResolvedValue([
      sale({ id: 'in', payments: [{ createdAt: new Date('2026-09-20T08:00:00Z') }] }),
      // created in range but last paid in October → belongs to October
      sale({ id: 'out', refNumber: 'S-9', payments: [{ createdAt: new Date('2026-10-02T08:00:00Z') }] }),
    ])
    const doc = await buildVatTaxInvoices({ from: '2026-09-01', to: '2026-09-30', docType: 'sales' }, meta)
    expect(doc.meta.rowCount).toBe(1)
    expect(doc.grandTotal!.vat).toBe('15.00')
  })

  it('manual tax invoice date overrides payment/created date', async () => {
    saleFindMany.mockResolvedValue([
      sale({ taxInvoiceDate: new Date('2026-08-15T08:00:00Z'), payments: [{ createdAt: new Date('2026-09-20T08:00:00Z') }] }),
    ])
    const doc = await buildVatTaxInvoices({ from: '2026-09-01', to: '2026-09-30', docType: 'sales' }, meta)
    expect(doc.meta.rowCount).toBe(0)
  })

  it('skips purchases with no VAT (zero-rated) and the unwanted document type', async () => {
    purchaseFindMany.mockResolvedValue([purchase({ vatAmount: null, customer: { ...cust, zeroRated: true } })])
    const doc = await buildVatTaxInvoices({ from: '2026-09-01', to: '2026-09-30', docType: 'purchases' }, meta)
    expect(doc.meta.rowCount).toBe(0)
    expect(saleFindMany).not.toHaveBeenCalled()
  })

  it('passes customer and account-type filters to the queries', async () => {
    saleFindMany.mockResolvedValue([]); purchaseFindMany.mockResolvedValue([])
    const id = '11111111-1111-4111-8111-111111111111'
    await buildVatTaxInvoices({ from: '2026-09-01', to: '2026-09-30', customerId: id, customerType: 'account' }, meta)
    expect(saleFindMany.mock.calls[0]![0].where).toMatchObject({ customerId: id, customer: { customerType: 'account' } })
    expect(purchaseFindMany.mock.calls[0]![0].where.customer).toEqual({ customerType: 'account', id })
  })
})
