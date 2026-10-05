import { describe, it, expect, vi, beforeEach } from 'vitest'

const stocktakeFindMany = vi.fn()
const movementFindMany = vi.fn()
const productFindMany = vi.fn()
const userFindMany = vi.fn()

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    stocktake: { findMany: (...a: unknown[]) => stocktakeFindMany(...a) },
    stockMovement: { findMany: (...a: unknown[]) => movementFindMany(...a) },
    product: { findMany: (...a: unknown[]) => productFindMany(...a) },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
  },
}))

import { buildStockVariance } from '@/lib/services/reports/builders/stockVariance'
import { StockVarianceParamsSchema } from '@/lib/schemas/report'
import { countDataRows } from '@/lib/reports/flatten'

const meta = {
  generatedAt: '2026-10-05T00:00:00Z', generatedBy: 'Tester',
  company: { name: 'Co', address: '' }, currencySymbol: 'E',
}

const product = (id: string, name: string, price: string) => ({
  id, code: name.slice(0, 3).toUpperCase(), name, category: 'non-ferrous',
  defaultBuyPrice: price, categoryRef: null,
})

function params(extra: Record<string, string> = {}) {
  return StockVarianceParamsSchema.parse({ from: '2026-10-01', to: '2026-10-05', ...extra })
}

beforeEach(() => {
  vi.clearAllMocks()
  productFindMany.mockResolvedValue([product('p1', 'Copper', '100'), product('p2', 'Lead', '10')])
  userFindMany.mockResolvedValue([{ id: 'u1', fullName: 'Thabo Dlamini', username: 'thabo' }])
  stocktakeFindMany.mockResolvedValue([{
    refNumber: 'ST-1', completedAt: new Date('2026-10-02T10:00:00Z'), createdByUserId: 'u1',
    entries: [
      { productId: 'p1', systemQty: '50', countedQty: '47.5', variance: '-2.5' },
      { productId: 'p2', systemQty: '20', countedQty: '20', variance: '0' },
    ],
  }])
  movementFindMany.mockResolvedValue([
    { id: 'm1', productId: 'p1', direction: 'out', quantity: '1.5', createdAt: new Date('2026-10-03T08:00:00Z'), createdByUserId: 'u1',
      notes: 'Physical count: system 47.500, counted 46.000, diff -1.500. Recount' },
    { id: 'm2', productId: 'p2', direction: 'in', quantity: '4', createdAt: new Date('2026-10-04T08:00:00Z'), createdByUserId: null, notes: 'found in shed' },
    { id: 'm3', productId: 'p2', direction: 'out', quantity: '9', createdAt: new Date('2026-10-04T09:00:00Z'), createdByUserId: null, notes: 'Transfer to Copper' },
  ])
})

describe('buildStockVariance', () => {
  it('combines stocktake entries and manual adjustments, skips transfers and zero rows', async () => {
    const doc = await buildStockVariance(params(), meta)
    expect(countDataRows(doc.groups)).toBe(3)
    const net = doc.summary!.find((s) => s.label === 'Net variance (qty)')!
    expect(net.value).toBe('0.000') // -2.5 -1.5 +4
    expect(doc.summary!.find((s) => s.label === 'Shortages (qty)')!.value).toBe('-4.000')
    expect(doc.summary!.find((s) => s.label === 'Shortages (est. value at buy price)')!.value).toBe('-400.00')
  })

  it('parses system and counted quantities out of a manual count note', async () => {
    const doc = await buildStockVariance(params({ kind: 'manual_count' }), meta)
    expect(stocktakeFindMany).not.toHaveBeenCalled()
    const row = doc.groups.flatMap((g) => g.groups ?? [g]).flatMap((g) => g.rows ?? [])[0]!
    expect(row.cells.systemQty).toBe('47.500')
    expect(row.cells.countedQty).toBe('46.000')
    expect(row.cells.variance).toBe('-1.500')
    expect(row.cells.notes).toBe('Recount')
  })

  it('filters shortages only, by minimum variance and by user', async () => {
    expect(countDataRows((await buildStockVariance(params({ direction: 'shortage' }), meta)).groups)).toBe(2)
    expect(countDataRows((await buildStockVariance(params({ minVariance: '2' }), meta)).groups)).toBe(2) // -2.5 and +4
    expect(countDataRows((await buildStockVariance(params({ user: 'thabo' }), meta)).groups)).toBe(2)
  })

  it('shows zero-variance stocktake rows only when asked', async () => {
    const doc = await buildStockVariance(params({ includeZero: 'yes' }), meta)
    expect(countDataRows(doc.groups)).toBe(4)
  })
})
