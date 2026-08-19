/**
 * listPayments tests — prisma is mocked so no database is required. Focus:
 * the admin-sale-hiding rule (Sales Payments module) — a non-admin viewer
 * never sees a sale-sourced Payment row or a direct-sale row whose
 * underlying sale was created by an admin account; purchase-sourced rows
 * are never touched by this rule; an admin viewer sees everything.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    payment: {
      findMany: vi.fn(() => Promise.resolve([])),
      count: vi.fn(() => Promise.resolve(0)),
      aggregate: vi.fn(() => Promise.resolve({ _sum: { amount: null } })),
    },
    sale: {
      findMany: vi.fn(() => Promise.resolve([])),
      count: vi.fn(() => Promise.resolve(0)),
      aggregate: vi.fn(() => Promise.resolve({ _sum: { totalAmount: null } })),
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

import { prisma } from '@/lib/db/prisma'
import { listPayments } from '@/lib/services/paymentService'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.payment.findMany).mockResolvedValue([])
  vi.mocked(prisma.payment.count).mockResolvedValue(0)
  vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: null } } as never)
  vi.mocked(prisma.sale.findMany).mockResolvedValue([])
  vi.mocked(prisma.sale.count).mockResolvedValue(0)
  vi.mocked(prisma.sale.aggregate).mockResolvedValue({ _sum: { totalAmount: null } } as never)
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'admin-1' }] as never)
})

describe('listPayments — admin-sale visibility', () => {
  it('omitting viewerRole applies no admin filter and never queries User', async () => {
    await listPayments({})
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    const paymentWhere = vi.mocked(prisma.payment.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(paymentWhere.NOT).toBeUndefined()
    const saleWhere = vi.mocked(prisma.sale.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(saleWhere.createdByUserId).toBeUndefined()
  })

  it('an admin viewer sees every payment and every direct sale', async () => {
    await listPayments({ viewerRole: 'admin' })
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    const paymentWhere = vi.mocked(prisma.payment.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(paymentWhere.NOT).toBeUndefined()
  })

  it('a non-admin viewer excludes admin-authored sale-sourced payments, leaving purchase rows untouched', async () => {
    await listPayments({ viewerRole: 'cashier' })
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { role: 'admin' }, select: { id: true } })
    const paymentWhere = vi.mocked(prisma.payment.findMany).mock.calls[0][0]!.where as {
      NOT?: { source: string; sale: { createdByUserId: { in: string[] } } }
    }
    expect(paymentWhere.NOT).toEqual({ source: 'sale', sale: { createdByUserId: { in: ['admin-1'] } } })
  })

  it('a non-admin viewer excludes admin-authored direct (unsettled-as-Payment) sales', async () => {
    await listPayments({ viewerRole: 'cashier' })
    const saleWhere = vi.mocked(prisma.sale.findMany).mock.calls[0][0]!.where as { createdByUserId?: { notIn: string[] } }
    expect(saleWhere.createdByUserId).toEqual({ notIn: ['admin-1'] })
  })

  it('a non-admin viewer with no admin users in the tenant applies no filter', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    await listPayments({ viewerRole: 'manager' })
    const paymentWhere = vi.mocked(prisma.payment.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(paymentWhere.NOT).toBeUndefined()
  })

  it('requesting source: purchase explicitly still skips the direct-sales union (unaffected by the admin rule)', async () => {
    await listPayments({ viewerRole: 'cashier', source: 'purchase' })
    expect(prisma.sale.findMany).not.toHaveBeenCalled()
  })
})
