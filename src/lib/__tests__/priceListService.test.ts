/**
 * priceListService tests — prisma and tenant context are mocked so no
 * database is required. Focus: item persistence order/shape, the single-
 * active-list invariant, duplication behavior, optimistic locking, and the
 * EX VAT derivation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    priceList: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    priceListItem: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/db/tenantContext', () => ({
  requireTenantId: vi.fn(() => 'tenant-1'),
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { prisma } from '@/lib/db/prisma'
import {
  exVatPrice,
  createPriceList,
  updatePriceList,
  duplicatePriceList,
  activatePriceList,
} from '@/lib/services/priceListService'
import { DEFAULT_PRICE_LIST_COLORS } from '@/lib/schemas/priceList'

// $transaction(cb) executes the callback against the same mocked client.
function passthroughTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(
    (async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)) as never
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  passthroughTransaction()
})

// ─── EX VAT derivation ────────────────────────────────────────────────────────
describe('exVatPrice', () => {
  it('derives E200.00 EX from E230.00 INC at 15%', () => {
    expect(exVatPrice('230.00').toFixed(2)).toBe('200.00')
  })

  it('rounds to 2 decimal places', () => {
    expect(exVatPrice('100.00').toFixed(2)).toBe('86.96')
  })
})

// ─── Create ───────────────────────────────────────────────────────────────────
describe('createPriceList', () => {
  it('persists header and items with tenant, 2 dp prices, and given sort order', async () => {
    vi.mocked(prisma.priceList.create).mockResolvedValue({ id: 'pl-1' } as never)

    await createPriceList({
      title: "TODAY'S PRICES",
      listDate: '2026-08-13',
      footerText: 'All weights in tonnes.',
      showLogo: true,
      showExVat: true,
      colors: DEFAULT_PRICE_LIST_COLORS,
      items: [
        { productId: 'prod-1', displayName: 'COPPER', category: 'Copper', priceIncVat: 230, sortOrder: 0 },
        { productId: null, displayName: 'MIXED STEEL', category: 'Steel', priceIncVat: 2.5, sortOrder: 1 },
      ],
    }, 'user-1')

    const arg = vi.mocked(prisma.priceList.create).mock.calls[0]![0]
    expect(arg.data.tenantId).toBe('tenant-1')
    expect(arg.data.createdByUserId).toBe('user-1')
    // listDate pinned to UTC midnight so the printed date never TZ-shifts
    expect((arg.data.listDate as Date).toISOString()).toBe('2026-08-13T00:00:00.000Z')
    expect(arg.data).toMatchObject(DEFAULT_PRICE_LIST_COLORS)
    const items = (arg.data.items as { create: { displayName: string; category: string; priceIncVat: string; sortOrder: number; tenantId: string }[] }).create
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ tenantId: 'tenant-1', displayName: 'COPPER', category: 'Copper', priceIncVat: '230', sortOrder: 0 })
    expect(items[1]).toMatchObject({ displayName: 'MIXED STEEL', category: 'Steel', priceIncVat: '2.5', sortOrder: 1 })
  })

  it('persists a customized palette', async () => {
    vi.mocked(prisma.priceList.create).mockResolvedValue({ id: 'pl-1' } as never)

    await createPriceList({
      title: 'PROMO PRICES',
      listDate: '2026-08-13',
      footerText: '',
      showLogo: true,
      showExVat: true,
      colors: { ...DEFAULT_PRICE_LIST_COLORS, primaryColor: '#C0392B', accentColor: '#FFD700' },
      items: [{ productId: 'prod-1', displayName: 'COPPER', category: 'Copper', priceIncVat: 230, sortOrder: 0 }],
    }, 'user-1')

    const arg = vi.mocked(prisma.priceList.create).mock.calls[0]![0]
    expect(arg.data).toMatchObject({ primaryColor: '#C0392B', accentColor: '#FFD700', rowTintColor: DEFAULT_PRICE_LIST_COLORS.rowTintColor })
  })
})

// ─── Activate ─────────────────────────────────────────────────────────────────
describe('activatePriceList', () => {
  it('clears every other active list and sets the target, inside one transaction', async () => {
    vi.mocked(prisma.priceList.findUnique).mockResolvedValue({ id: 'pl-2' } as never)
    vi.mocked(prisma.priceList.update).mockResolvedValue({ id: 'pl-2', isActiveForPurchases: true } as never)

    const result = await activatePriceList('pl-2', 'user-1')

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.priceList.updateMany).toHaveBeenCalledWith({
      where: { isActiveForPurchases: true, id: { not: 'pl-2' } },
      data:  { isActiveForPurchases: false },
    })
    expect(prisma.priceList.update).toHaveBeenCalledWith({
      where: { id: 'pl-2' },
      data:  { isActiveForPurchases: true },
    })
    expect(result).toMatchObject({ id: 'pl-2', isActiveForPurchases: true })
  })

  it('rejects an unknown id without touching other lists', async () => {
    vi.mocked(prisma.priceList.findUnique).mockResolvedValue(null)
    await expect(activatePriceList('missing', 'user-1')).rejects.toThrow('Price list not found')
    expect(prisma.priceList.updateMany).not.toHaveBeenCalled()
  })
})

// ─── Duplicate ────────────────────────────────────────────────────────────────
describe('duplicatePriceList', () => {
  it('copies items, resets the active flag, and re-dates to today', async () => {
    vi.mocked(prisma.priceList.findUniqueOrThrow).mockResolvedValue({
      id: 'pl-1',
      title: 'MONDAY PRICES',
      footerText: 'footer',
      showLogo: false,
      showExVat: true,
      isActiveForPurchases: true,
      ...DEFAULT_PRICE_LIST_COLORS,
      primaryColor: '#C0392B', // customized — duplicate must carry this over
      items: [
        { productId: 'prod-1', displayName: 'COPPER', category: 'Copper', priceIncVat: '230.00', sortOrder: 0 },
      ],
    } as never)
    vi.mocked(prisma.priceList.create).mockResolvedValue({ id: 'pl-copy' } as never)

    await duplicatePriceList('pl-1', 'user-1')

    const arg = vi.mocked(prisma.priceList.create).mock.calls[0]![0]
    expect(arg.data.title).toBe('MONDAY PRICES (copy)')
    // The copy never inherits the "shown in Purchases" flag
    expect(arg.data).not.toHaveProperty('isActiveForPurchases', true)
    expect((arg.data.listDate as Date).toISOString()).toBe(
      new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
    )
    // Customized palette carries over to the copy
    expect(arg.data).toMatchObject({ primaryColor: '#C0392B', accentColor: DEFAULT_PRICE_LIST_COLORS.accentColor })
    const items = (arg.data.items as { create: { displayName: string; category: string }[] }).create
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ productId: 'prod-1', displayName: 'COPPER', category: 'Copper', priceIncVat: '230.00' })
  })
})

// ─── Update ───────────────────────────────────────────────────────────────────
describe('updatePriceList', () => {
  const input = {
    title: 'T',
    listDate: '2026-08-13',
    footerText: '',
    showLogo: true,
    showExVat: false,
    colors: { ...DEFAULT_PRICE_LIST_COLORS, primaryColor: '#008080' },
    items: [{ productId: null, displayName: 'BRASS', category: 'Brass', priceIncVat: 120.75, sortOrder: 0 }],
    updatedAt: '2026-08-13T08:00:00.000Z',
  }

  it('replaces items atomically when the lock matches', async () => {
    vi.mocked(prisma.priceList.findUnique).mockResolvedValue({
      id: 'pl-1', updatedAt: new Date('2026-08-13T08:00:00.000Z'),
    } as never)
    vi.mocked(prisma.priceList.update).mockResolvedValue({ id: 'pl-1' } as never)

    await updatePriceList('pl-1', input)

    expect(prisma.priceListItem.deleteMany).toHaveBeenCalledWith({ where: { priceListId: 'pl-1' } })
    const arg = vi.mocked(prisma.priceList.update).mock.calls[0]![0]
    expect(arg.where).toEqual({ id: 'pl-1' })
    expect(arg.data).toMatchObject({ primaryColor: '#008080' })
    expect((arg.data.items as { create: { displayName: string }[] }).create[0]).toMatchObject({ displayName: 'BRASS' })
  })

  it('rejects a stale optimistic lock without deleting items', async () => {
    vi.mocked(prisma.priceList.findUnique).mockResolvedValue({
      id: 'pl-1', updatedAt: new Date('2026-08-13T09:30:00.000Z'),
    } as never)

    await expect(updatePriceList('pl-1', input)).rejects.toThrow('modified by another user')
    expect(prisma.priceListItem.deleteMany).not.toHaveBeenCalled()
  })
})
