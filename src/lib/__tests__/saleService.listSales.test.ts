/**
 * listSales tests — prisma is mocked so no database is required. Focus:
 * the admin-sale-hiding rule (Sales History / Unpaid Sales) — a non-admin
 * viewer never sees a sale created by an admin account, an admin viewer
 * sees everything, and omitting viewerRole entirely (no caller does this
 * today, but nothing should break if one did) filters nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    sale: {
      findMany: vi.fn(() => Promise.resolve([])),
      count: vi.fn(() => Promise.resolve(0)),
    },
    user: {
      findMany: vi.fn(() => Promise.resolve([])),
    },
  },
}))

vi.mock('@/lib/db/tenantContext', () => ({
  requireTenantId: vi.fn(() => 'tenant-1'),
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// listSales only touches prisma directly, but saleService.ts imports these
// modules at the top for its other exports — stub them so the import
// doesn't pull in their own dependency chains.
vi.mock('@/lib/services/stockService', () => ({ recordMovement: vi.fn(), recordVoidReversal: vi.fn() }))
vi.mock('@/lib/services/businessLoanService', () => ({ applyBusinessLoanRepaymentTx: vi.fn(), reverseRepaymentsForSale: vi.fn() }))
vi.mock('@/lib/services/cashUpService', () => ({ isSessionDateApproved: vi.fn() }))
vi.mock('@/lib/services/ledgerService', () => ({
  postSale: vi.fn(), reverseSaleLedger: vi.fn(), reverseSalePaymentLedger: vi.fn(),
  postSaleSettlement: vi.fn(), reverseJournalEntry: vi.fn(), reverseSaleCost: vi.fn(),
}))

import { prisma } from '@/lib/db/prisma'
import { listSales } from '@/lib/services/saleService'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.sale.findMany).mockResolvedValue([])
  vi.mocked(prisma.sale.count).mockResolvedValue(0)
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }] as never)
})

describe('listSales — admin-sale visibility', () => {
  it('omitting viewerRole applies no admin filter and never queries User', async () => {
    await listSales({})
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    const where = vi.mocked(prisma.sale.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(where.createdByUserId).toBeUndefined()
  })

  it('an admin viewer sees every sale — no createdByUserId filter applied', async () => {
    await listSales({ viewerRole: 'admin' })
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    const where = vi.mocked(prisma.sale.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(where.createdByUserId).toBeUndefined()
  })

  it('a non-admin viewer (cashier) excludes every admin-authored sale', async () => {
    await listSales({ viewerRole: 'cashier' })
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { role: 'admin' }, select: { id: true } })
    const where = vi.mocked(prisma.sale.findMany).mock.calls[0][0]!.where as { createdByUserId?: { notIn: string[] } }
    expect(where.createdByUserId).toEqual({ notIn: ['admin-1', 'admin-2'] })
  })

  it('a non-admin viewer with no admin users in the tenant applies no filter (nothing to hide)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    await listSales({ viewerRole: 'manager' })
    const where = vi.mocked(prisma.sale.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(where.createdByUserId).toBeUndefined()
  })

  it('the admin filter and the count query stay consistent with each other', async () => {
    await listSales({ viewerRole: 'scale_operator' })
    const findManyWhere = vi.mocked(prisma.sale.findMany).mock.calls[0][0]!.where
    const countWhere = vi.mocked(prisma.sale.count).mock.calls[0][0]!.where
    expect(countWhere).toEqual(findManyWhere)
  })
})
