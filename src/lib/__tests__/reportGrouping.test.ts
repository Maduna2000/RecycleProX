import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import { groupRows } from '@/lib/services/reports/grouping'
import { flattenReportDocument, countDataRows } from '@/lib/reports/flatten'
import type { ReportDocument } from '@/lib/reports/types'

interface Item {
  accountCat: string
  topCat: string
  subCat: string
  product: string
  mass: string
  value: string
}

const items: Item[] = [
  { accountCat: 'CASUALS', topCat: 'FERROUS', subCat: 'FERROUS', product: 'LIGHT STEEL', mass: '64', value: '192.00' },
  { accountCat: 'CASUALS', topCat: 'FERROUS', subCat: 'FERROUS', product: 'LIGHT STEEL', mass: '36', value: '108.00' },
  { accountCat: 'CASUALS', topCat: 'NON-FERROUS', subCat: 'COPPER', product: 'CU MIXED', mass: '2.5', value: '425.00' },
  { accountCat: 'DEALERS 1', topCat: 'NON-FERROUS', subCat: 'ALUMINIUM', product: 'ALLY CAST', mass: '10', value: '270.00' },
  { accountCat: 'UNCATEGORISED', topCat: 'FERROUS', subCat: 'FERROUS', product: 'SUB GRADE', mass: '100', value: '250.00' },
]

function build() {
  return groupRows(items, {
    groups: [
      { label: (i) => i.accountCat, order: ['CASUALS', 'DEALERS 1'], sortLast: ['UNCATEGORISED'] },
      { label: (i) => i.topCat },
      { label: (i) => i.subCat, collapseIfSameAsParent: true },
    ],
    row: {
      key: (i) => i.product,
      build: (rows, totals) => ({
        product: rows[0]!.product,
        mass: totals.mass!.toFixed(3),
        value: totals.value!.toFixed(2),
      }),
    },
    measures: {
      mass: (i) => new Decimal(i.mass),
      value: (i) => new Decimal(i.value),
    },
    formatTotals: (t) => ({ mass: t.mass!.toFixed(3), value: t.value!.toFixed(2) }),
  })
}

describe('groupRows', () => {
  it('accumulates the grand total exactly', () => {
    const { grandTotal } = build()
    expect(grandTotal.value).toBe('1245.00')
    expect(grandTotal.mass).toBe('212.500')
  })

  it('orders groups per spec with sortLast at the end', () => {
    const { groups } = build()
    expect(groups.map((g) => g.label)).toEqual(['CASUALS', 'DEALERS 1', 'UNCATEGORISED'])
  })

  it('aggregates duplicate row keys into one row', () => {
    const { groups } = build()
    const casuals = groups[0]!
    const ferrous = casuals.groups![0]!
    // FERROUS subCat === FERROUS topCat → collapsed: rows sit under the top band
    expect(ferrous.label).toBe('FERROUS')
    expect(ferrous.rows).toHaveLength(1)
    expect(ferrous.rows![0]!.cells.mass).toBe('100.000')
    expect(ferrous.rows![0]!.cells.value).toBe('300.00')
  })

  it('keeps distinct subcategory bands when labels differ', () => {
    const { groups } = build()
    const casuals = groups[0]!
    const nonFerrous = casuals.groups!.find((g) => g.label === 'NON-FERROUS')!
    expect(nonFerrous.groups![0]!.label).toBe('COPPER')
    expect(nonFerrous.subtotal!.value).toBe('425.00')
  })

  it('carries subtotals at every level', () => {
    const { groups } = build()
    const casuals = groups[0]!
    expect(casuals.subtotal!.value).toBe('725.00')
    const dealers1 = groups[1]!
    expect(dealers1.subtotal!.value).toBe('270.00')
  })
})

describe('flattenReportDocument', () => {
  it('emits headers, data, subtotals and grand total in render order', () => {
    const { groups, grandTotal } = build()
    const doc: ReportDocument = {
      reportId: 't', title: 'T',
      params: { from: '2026-01-01', to: '2026-01-31' },
      columns: [
        { key: 'product', label: 'Product', width: 0.5 },
        { key: 'mass', label: 'Mass', width: 0.25, format: 'mass' },
        { key: 'value', label: 'Value', width: 0.25, format: 'money' },
      ],
      groups, grandTotal,
      meta: {
        generatedAt: new Date().toISOString(), generatedBy: 'test',
        company: { name: 'Test Yard', address: '' },
        currencySymbol: 'R', rowCount: countDataRows(groups),
      },
    }
    const flat = flattenReportDocument(doc)
    expect(flat[0]).toMatchObject({ type: 'groupHeader', label: 'CASUALS', level: 0 })
    expect(flat[flat.length - 1]).toMatchObject({ type: 'grandTotal' })
    const types = flat.map((r) => r.type)
    expect(types.filter((t) => t === 'data')).toHaveLength(4)
    // every group with a subtotal emits one
    expect(types.filter((t) => t === 'subtotal').length).toBeGreaterThanOrEqual(5)
    expect(doc.meta.rowCount).toBe(4)
  })
})
