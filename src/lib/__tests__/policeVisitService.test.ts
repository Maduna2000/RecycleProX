/**
 * Police Register module tests — inspection session lifecycle, idle expiry,
 * logged searches, and input schemas. Prisma and R2 are mocked; no DB needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock prisma ──────────────────────────────────────────────────────────────
vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    policeVisit:     { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    policeSearchLog: { create: vi.fn() },
    purchase:        { findMany: vi.fn() },
    purchaseLine:    { findMany: vi.fn() },
    customer:        { findMany: vi.fn(), findUnique: vi.fn() },
    product:         { findUnique: vi.fn() },
    user:            { findMany: vi.fn() },
    systemSettings:  { findMany: vi.fn() },
    $transaction:    vi.fn(),
  }
  // Interactive transactions run the callback against the same mock client
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma))
  return { prisma }
})

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/r2', () => ({
  getViewUrl:   vi.fn(async (key: string) => `https://r2.example/${key}`),
  fetchR2Bytes: vi.fn(async () => null),
}))

import { prisma } from '@/lib/db/prisma'
import {
  beginInspection,
  endInspection,
  expireStaleVisits,
  getActiveVisitOrThrow,
  searchRegisterByDate,
  searchPersons,
  searchGoods,
  getPersonRecordReport,
  getGoodsTraceReport,
  PoliceVisitNotActiveError,
  INSPECTION_IDLE_TIMEOUT_MS,
} from '@/lib/services/policeVisitService'
import {
  BeginInspectionSchema,
  RegisterSearchSchema,
  GoodsSearchSchema,
  EndInspectionSchema,
} from '@/lib/schemas/police'

const mocked = vi.mocked

const OFFICER = {
  officerName: 'J. Nkosi',
  rank: 'Constable',
  badgeNumber: '7012345-6',
  stationName: 'Pretoria Central',
  contactNumber: undefined,
  visitReason: 'routine_inspection' as const,
  visitNote: undefined,
}

function activeVisit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'visit-1',
    status: 'active',
    startedAt: new Date(),
    createdAt: new Date(),
    searchLogs: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked(prisma.$transaction).mockImplementation(
    async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)
  )
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('beginInspection', () => {
  it('creates an active visit stamped with startedAt and the launching user', async () => {
    mocked(prisma.policeVisit.create).mockResolvedValue(activeVisit() as never)
    await beginInspection(OFFICER, 'user-1')
    const arg = mocked(prisma.policeVisit.create).mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(arg.data.status).toBe('active')
    expect(arg.data.launchedByUserId).toBe('user-1')
    expect(arg.data.startedAt).toBeInstanceOf(Date)
    expect(arg.data.rank).toBe('Constable')
  })
})

describe('endInspection', () => {
  it('sign → completed with signedAt and signature key', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit() as never)
    mocked(prisma.policeVisit.update).mockResolvedValue(activeVisit({ status: 'completed' }) as never)
    await endInspection('visit-1', { action: 'sign', signatureR2Key: 'sig-key' }, 'user-1')
    const arg = mocked(prisma.policeVisit.update).mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(arg.data.status).toBe('completed')
    expect(arg.data.signatureR2Key).toBe('sig-key')
    expect(arg.data.signedAt).toBeInstanceOf(Date)
  })

  it('force_end → expired', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit() as never)
    mocked(prisma.policeVisit.update).mockResolvedValue(activeVisit({ status: 'expired' }) as never)
    await endInspection('visit-1', { action: 'force_end' }, 'mgr-1')
    const arg = mocked(prisma.policeVisit.update).mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(arg.data.status).toBe('expired')
  })

  it('throws when the visit is not active', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit({ status: 'completed' }) as never)
    await expect(endInspection('visit-1', { action: 'force_end' }, 'mgr-1'))
      .rejects.toBeInstanceOf(PoliceVisitNotActiveError)
  })
})

describe('getActiveVisitOrThrow', () => {
  it('throws not_found for a missing visit', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(null as never)
    await expect(getActiveVisitOrThrow('nope')).rejects.toMatchObject({ reason: 'not_found' })
  })

  it('throws ended for a completed visit', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit({ status: 'completed' }) as never)
    await expect(getActiveVisitOrThrow('visit-1')).rejects.toMatchObject({ reason: 'ended' })
  })

  it('expires an idle session on access and throws expired', async () => {
    const stale = new Date(Date.now() - INSPECTION_IDLE_TIMEOUT_MS - 60_000)
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit({ startedAt: stale }) as never)
    mocked(prisma.policeVisit.update).mockResolvedValue(activeVisit({ status: 'expired' }) as never)
    await expect(getActiveVisitOrThrow('visit-1')).rejects.toMatchObject({ reason: 'expired' })
    expect(mocked(prisma.policeVisit.update)).toHaveBeenCalledWith({
      where: { id: 'visit-1' }, data: { status: 'expired' },
    })
  })

  it('a recent search keeps an old session alive', async () => {
    const staleStart = new Date(Date.now() - INSPECTION_IDLE_TIMEOUT_MS - 60_000)
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(
      activeVisit({ startedAt: staleStart, searchLogs: [{ createdAt: new Date() }] }) as never
    )
    await expect(getActiveVisitOrThrow('visit-1')).resolves.toMatchObject({ id: 'visit-1' })
    expect(mocked(prisma.policeVisit.update)).not.toHaveBeenCalled()
  })
})

describe('expireStaleVisits', () => {
  it('expires only sessions with no activity inside the idle window', async () => {
    const stale  = new Date(Date.now() - INSPECTION_IDLE_TIMEOUT_MS - 120_000)
    mocked(prisma.policeVisit.findMany).mockResolvedValue([
      activeVisit({ id: 'stale-1',  startedAt: stale, searchLogs: [] }),
      activeVisit({ id: 'alive-1',  startedAt: stale, searchLogs: [{ createdAt: new Date() }] }),
    ] as never)
    mocked(prisma.policeVisit.updateMany).mockResolvedValue({ count: 1 } as never)

    const count = await expireStaleVisits()
    expect(count).toBe(1)
    const arg = mocked(prisma.policeVisit.updateMany).mock.calls[0]![0] as { where: { id: { in: string[] } } }
    expect(arg.where.id.in).toEqual(['stale-1'])
  })

  it('returns 0 when nothing is stale', async () => {
    mocked(prisma.policeVisit.findMany).mockResolvedValue([] as never)
    const count = await expireStaleVisits()
    expect(count).toBe(0)
    expect(mocked(prisma.policeVisit.updateMany)).not.toHaveBeenCalled()
  })
})

// ─── Searches ─────────────────────────────────────────────────────────────────

const PURCHASE = {
  id: 'p-1',
  refNumber: 'PUR-001',
  createdAt: new Date('2026-07-07T10:00:00'),
  totalAmount: { toString: () => '150.00' },
  photoR2Keys: ['photos/p-1/1.jpg'],
  customer: {
    id: 'c-1', firstName: 'Sipho', lastName: 'Dlamini', idNumber: '8501015800083',
    dateOfBirth: null, physicalAddress: '12 Main Rd', postalAddress: null,
    blacklisted: true, idPhotoR2Key: 'ids/c-1.jpg',
  },
  lines: [{ product: { name: 'Copper', unit: 'kg' }, quantity: { toString: () => '12.5' } }],
}

describe('searchRegisterByDate', () => {
  it('queries completed purchases only and logs the search with the result count', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit() as never)
    mocked(prisma.purchase.findMany).mockResolvedValue([PURCHASE] as never)
    mocked(prisma.policeSearchLog.create).mockResolvedValue({} as never)

    const { rows } = await searchRegisterByDate('visit-1', '2026-07-07', '2026-07-07')

    const where = (mocked(prisma.purchase.findMany).mock.calls[0]![0] as { where: Record<string, unknown> }).where
    expect(where.status).toBe('completed')

    const log = (mocked(prisma.policeSearchLog.create).mock.calls[0]![0] as { data: Record<string, unknown> }).data
    expect(log).toMatchObject({ visitId: 'visit-1', searchType: 'register_by_date', queryText: '2026-07-07', resultCount: 1 })

    expect(rows[0]).toMatchObject({
      refNumber: 'PUR-001',
      supplierName: 'Sipho Dlamini',
      blacklisted: true,
      totalAmount: '150.00',
      idPhotoUrl: 'https://r2.example/ids/c-1.jpg',
    })
    expect(rows[0]!.lines[0]).toMatchObject({ productName: 'Copper', quantity: '12.5', unit: 'kg' })
  })

  it('rejects searches on an ended session with a typed error', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit({ status: 'expired' }) as never)
    await expect(searchRegisterByDate('visit-1', '2026-07-07', '2026-07-07'))
      .rejects.toBeInstanceOf(PoliceVisitNotActiveError)
    expect(mocked(prisma.policeSearchLog.create)).not.toHaveBeenCalled()
  })
})

describe('searchPersons', () => {
  it('returns blacklist details and logs the query text', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit() as never)
    mocked(prisma.customer.findMany).mockResolvedValue([{
      id: 'c-1', firstName: 'Sipho', lastName: 'Dlamini', companyName: null,
      idNumber: '8501015800083', phone: '0821234567',
      physicalAddress: '12 Main Rd', postalAddress: null,
      blacklisted: true, blacklistReason: 'Suspected stolen goods',
      idPhotoR2Key: null,
      _count: { purchases: 4 },
      purchases: [{ createdAt: new Date('2026-07-01') }],
    }] as never)
    mocked(prisma.policeSearchLog.create).mockResolvedValue({} as never)

    const { rows } = await searchPersons('visit-1', 'dlamini')
    expect(rows[0]).toMatchObject({
      fullName: 'Sipho Dlamini',
      blacklisted: true,
      blacklistReason: 'Suspected stolen goods',
      purchaseCount: 4,
    })

    const log = (mocked(prisma.policeSearchLog.create).mock.calls[0]![0] as { data: Record<string, unknown> }).data
    expect(log).toMatchObject({ searchType: 'person', queryText: 'dlamini', resultCount: 1 })
  })
})

describe('searchGoods', () => {
  it('applies minQuantity and completed-purchase filters and logs a readable query', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit() as never)
    mocked(prisma.product.findUnique).mockResolvedValue({ name: 'Copper', unit: 'kg' } as never)
    mocked(prisma.purchaseLine.findMany).mockResolvedValue([{
      purchaseId: 'p-1',
      quantity: { toString: () => '50' },
      lineTotal: { toString: () => '4500.00' },
      product: { unit: 'kg' },
      purchase: { refNumber: 'PUR-001', createdAt: new Date(), photoR2Keys: [], customer: PURCHASE.customer },
    }] as never)
    mocked(prisma.policeSearchLog.create).mockResolvedValue({} as never)

    const { rows, productName } = await searchGoods('visit-1', {
      productId: 'prod-1', from: '2026-07-01', to: '2026-07-07', minQuantity: 10,
    })

    const where = (mocked(prisma.purchaseLine.findMany).mock.calls[0]![0] as { where: Record<string, unknown> }).where
    expect(where.quantity).toEqual({ gte: 10 })
    expect((where.purchase as Record<string, unknown>).status).toBe('completed')

    const log = (mocked(prisma.policeSearchLog.create).mock.calls[0]![0] as { data: Record<string, unknown> }).data
    expect(log).toMatchObject({ searchType: 'goods', queryText: 'Copper · 2026-07-01 to 2026-07-07 · min 10', resultCount: 1 })

    expect(productName).toBe('Copper')
    expect(rows[0]).toMatchObject({ supplierName: 'Sipho Dlamini', quantity: '50', lineTotal: '4500.00' })
  })
})

// ─── Downloadable reports ─────────────────────────────────────────────────────

describe('getPersonRecordReport', () => {
  it('logs the download as a person disclosure with the records count', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit() as never)
    mocked(prisma.customer.findUnique).mockResolvedValue({
      id: 'c-1', firstName: 'Sipho', lastName: 'Dlamini', idNumber: '8501015800083',
      dateOfBirth: null, gender: null, nationality: null, phone: '0821234567',
      email: null, physicalAddress: '12 Main Rd', postalAddress: null,
      blacklisted: false, blacklistReason: null, idPhotoR2Key: null,
      purchases: [PURCHASE, PURCHASE],
    } as never)
    mocked(prisma.policeSearchLog.create).mockResolvedValue({} as never)
    mocked(prisma.systemSettings.findMany).mockResolvedValue([] as never)

    const result = await getPersonRecordReport('visit-1', 'c-1')
    expect(result).not.toBeNull()
    expect(result!.customer.firstName).toBe('Sipho')

    const log = (mocked(prisma.policeSearchLog.create).mock.calls[0]![0] as { data: Record<string, unknown> }).data
    expect(log).toMatchObject({
      searchType:  'person',
      queryText:   'report: Sipho Dlamini (8501015800083)',
      resultCount: 2,
    })
  })

  it('refuses when the inspection session is not active', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit({ status: 'completed' }) as never)
    await expect(getPersonRecordReport('visit-1', 'c-1')).rejects.toBeInstanceOf(PoliceVisitNotActiveError)
    expect(mocked(prisma.policeSearchLog.create)).not.toHaveBeenCalled()
  })
})

describe('getGoodsTraceReport', () => {
  it('logs the download with a report-prefixed query text', async () => {
    mocked(prisma.policeVisit.findUnique).mockResolvedValue(activeVisit() as never)
    mocked(prisma.product.findUnique).mockResolvedValue({ name: 'Copper', unit: 'kg' } as never)
    mocked(prisma.purchaseLine.findMany).mockResolvedValue([{
      purchaseId: 'p-1',
      quantity: { toString: () => '50' },
      lineTotal: { toString: () => '4500.00' },
      product: { unit: 'kg' },
      purchase: { refNumber: 'PUR-001', createdAt: new Date(), photoR2Keys: [], customer: PURCHASE.customer },
    }] as never)
    mocked(prisma.policeSearchLog.create).mockResolvedValue({} as never)
    mocked(prisma.systemSettings.findMany).mockResolvedValue([] as never)

    const result = await getGoodsTraceReport('visit-1', { productId: 'prod-1', from: '2026-07-01', to: '2026-07-07' })
    expect(result).not.toBeNull()
    expect(result!.product.name).toBe('Copper')
    expect(result!.lines).toHaveLength(1)

    const log = (mocked(prisma.policeSearchLog.create).mock.calls[0]![0] as { data: Record<string, unknown> }).data
    expect(log).toMatchObject({
      searchType:  'goods',
      queryText:   'report: Copper · 2026-07-01 to 2026-07-07',
      resultCount: 1,
    })
  })
})

// ─── Schemas ──────────────────────────────────────────────────────────────────

describe('police schemas', () => {
  it('BeginInspectionSchema requires name, rank, service number and station', () => {
    expect(BeginInspectionSchema.safeParse(OFFICER).success).toBe(true)
    expect(BeginInspectionSchema.safeParse({ ...OFFICER, rank: '' }).success).toBe(false)
    expect(BeginInspectionSchema.safeParse({ ...OFFICER, badgeNumber: '' }).success).toBe(false)
    expect(BeginInspectionSchema.safeParse({ ...OFFICER, stationName: '' }).success).toBe(false)
    expect(BeginInspectionSchema.safeParse({ ...OFFICER, visitReason: 'invalid' }).success).toBe(false)
  })

  it('EndInspectionSchema requires a signature when signing', () => {
    expect(EndInspectionSchema.safeParse({ action: 'sign' }).success).toBe(false)
    expect(EndInspectionSchema.safeParse({ action: 'sign', signatureR2Key: 'k' }).success).toBe(true)
    expect(EndInspectionSchema.safeParse({ action: 'force_end' }).success).toBe(true)
  })

  it('RegisterSearchSchema rejects an inverted date range', () => {
    const base = { visitId: '4dfc0d3e-58af-4199-ba69-b8a8d00b6461' }
    expect(RegisterSearchSchema.safeParse({ ...base, from: '2026-07-01', to: '2026-07-07' }).success).toBe(true)
    expect(RegisterSearchSchema.safeParse({ ...base, from: '2026-07-08', to: '2026-07-07' }).success).toBe(false)
  })

  it('GoodsSearchSchema coerces minQuantity from a query-string value', () => {
    const parsed = GoodsSearchSchema.safeParse({
      visitId:   '4dfc0d3e-58af-4199-ba69-b8a8d00b6461',
      productId: '94fed4c6-58af-4199-ba69-b8a8d00b6462',
      minQuantity: '25',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.minQuantity).toBe(25)
  })
})
