/**
 * ID Upload Status report builder tests — prisma is mocked so no database
 * is required. Focus: a customer with only a passport or only a driver's
 * license on file must count as "ID Uploaded: Yes", not just a national ID
 * copy — the same ID_LIKE_DOCUMENT_TYPES rule shared with the Photo Viewer.
 * Covers all three ID-status reports (Account, Casual, Sellers by Period).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    customer: { findMany: vi.fn(() => Promise.resolve([])) },
    customerDocument: { findMany: vi.fn(() => Promise.resolve([])) },
    purchase: { findMany: vi.fn(() => Promise.resolve([])) },
  },
}))

import { prisma } from '@/lib/db/prisma'
import {
  buildAccountIdUploadStatus,
  buildCasualIdUploadStatus,
  buildSellerIdUploadStatus,
} from '@/lib/services/reports/builders/accounts'

const meta = {
  generatedAt: '2026-08-19T00:00:00.000Z',
  generatedBy: 'test',
  company: { name: 'Test Yard', address: '1 Test St' },
  currencySymbol: 'R',
}

const CUSTOMER = {
  id: 'cust-1', firstName: 'Jane', lastName: 'Doe',
  accountCode: 'ACC-1', idNumber: '1234567890', phone: '0821234567',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.customer.findMany).mockResolvedValue([CUSTOMER] as never)
})

describe('Account ID Upload Status — accepts any ID-like document', () => {
  it('a customer with only a passport on file counts as uploaded', async () => {
    vi.mocked(prisma.customerDocument.findMany).mockResolvedValue([{ customerId: 'cust-1' }] as never)
    const report = await buildAccountIdUploadStatus({ from: '2026-01-01', to: '2026-08-19' }, meta)
    expect(prisma.customerDocument.findMany).toHaveBeenCalledWith({
      where: { customerId: { in: ['cust-1'] }, documentType: { in: ['id_copy', 'passport', 'drivers_licence'] } },
      select: { customerId: true },
    })
    expect(report.groups[0]!.rows[0]!.cells.idUploaded).toBe('Yes')
  })

  it('a customer with no document on file counts as missing', async () => {
    vi.mocked(prisma.customerDocument.findMany).mockResolvedValue([])
    const report = await buildAccountIdUploadStatus({ from: '2026-01-01', to: '2026-08-19' }, meta)
    expect(report.groups[0]!.rows[0]!.cells.idUploaded).toBe('No')
    expect(report.summary?.find((s) => s.label === 'ID missing')?.value).toBe('1')
  })
})

describe('Casual ID Upload Status — accepts any ID-like document', () => {
  it("a customer with only a driver's license on file counts as uploaded", async () => {
    vi.mocked(prisma.customerDocument.findMany).mockResolvedValue([{ customerId: 'cust-1' }] as never)
    const report = await buildCasualIdUploadStatus({ from: '2026-01-01', to: '2026-08-19' }, meta)
    expect(prisma.customerDocument.findMany).toHaveBeenCalledWith({
      where: { customerId: { in: ['cust-1'] }, documentType: { in: ['id_copy', 'passport', 'drivers_licence'] } },
      select: { customerId: true },
    })
    expect(report.groups[0]!.rows[0]!.cells.idUploaded).toBe('Yes')
  })
})

describe('Sellers ID Upload Status (by Period) — accepts any ID-like document', () => {
  it('a seller who sold in the period with only a passport on file counts as uploaded', async () => {
    vi.mocked(prisma.purchase.findMany).mockResolvedValue([
      { customer: { id: 'cust-1', firstName: 'Jane', lastName: 'Doe', customerType: 'casual', idNumber: '1234567890', phone: '0821234567' } },
    ] as never)
    vi.mocked(prisma.customerDocument.findMany).mockResolvedValue([{ customerId: 'cust-1' }] as never)

    const report = await buildSellerIdUploadStatus({ from: '2026-01-01', to: '2026-08-19' }, meta)

    expect(prisma.customerDocument.findMany).toHaveBeenCalledWith({
      where: { customerId: { in: ['cust-1'] }, documentType: { in: ['id_copy', 'passport', 'drivers_licence'] } },
      select: { customerId: true },
    })
    expect(report.groups[0]!.rows[0]!.cells.idUploaded).toBe('Yes')
  })
})
