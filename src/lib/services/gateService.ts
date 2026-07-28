import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { Prisma, type GateEntryPurpose } from '@prisma/client'
import logger from '@/lib/logger'
import { ciContains } from '@/lib/db/queryHelpers'
import type { CreateGateEntryInput, UpdateGatePurposeConfigInput, CreateSellOptionInput, UpdateSellOptionInput } from '@/lib/schemas/gate'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class GateVisitorBlacklistedError extends Error {
  constructor(reason?: string | null) {
    super(`This visitor is blacklisted${reason ? `: ${reason}` : ''} — entry cannot be registered`)
    this.name = 'GateVisitorBlacklistedError'
  }
}

export class GateEntryNotFoundError extends Error {
  constructor(id: string) { super(`Gate entry "${id}" not found`); this.name = 'GateEntryNotFoundError' }
}

export class GateEntryAlreadyExitedError extends Error {
  constructor(entryNumber: string) {
    super(`Gate entry "${entryNumber}" has already been checked out`)
    this.name = 'GateEntryAlreadyExitedError'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export interface GateEntryFilters {
  purpose?:    GateEntryPurpose
  onSiteOnly?: boolean
  dateFrom?:   string
  dateTo?:     string
  search?:     string
  page?:       number
  pageSize?:   number
}

const ALL_PURPOSES: GateEntryPurpose[] = ['sell', 'buy', 'visitor', 'other']

// ─── Entry number generator (atomic inside transaction) ───────────────────────

async function generateEntryNumber(tx: TxClient, date: Date): Promise<string> {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const prefix = `GATE-${y}${m}${d}`
  const startOfDay = new Date(y, date.getMonth(), date.getDate())
  const count = await tx.gateEntry.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// Queue number for the Scale Station — a short, callable-out-loud sequence
// (1, 2, 3...) that resets each day, counted only against today's other
// "sell" entries so it stays meaningful (only sell visits go to the scale).
async function generateQueueNumber(tx: TxClient, date: Date): Promise<number> {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const count = await tx.gateEntry.count({ where: { createdAt: { gte: startOfDay }, purpose: 'sell' } })
  return count + 1
}

// ─── Repeat-visit lookup ──────────────────────────────────────────────────────
// Matches on visitorIdNumber against this table's own history, independent of
// whether the visitor has ever become a real Customer — so it works for both.

export async function getRepeatVisitInfo(idNumber: string) {
  const [count, last] = await Promise.all([
    prisma.gateEntry.count({ where: { visitorIdNumber: idNumber } }),
    prisma.gateEntry.findFirst({
      where: { visitorIdNumber: idNumber },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, purpose: true },
    }),
  ])
  return {
    count,
    lastVisitAt: last?.createdAt.toISOString() ?? null,
    lastPurpose: last?.purpose ?? null,
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────
// customerId is never accepted from the client — always re-derived here from
// an exact idNumber match, so a client can't dodge the blacklist hard-block by
// omitting a customerId it knows would fail. A non-matching visitor is never
// turned into a new Customer row; their details just live inline on the entry.

export async function createGateEntry(data: CreateGateEntryInput, operatorId: string) {
  const tenantId = requireTenantId()

  const customer = await prisma.customer.findUnique({
    where: { tenantId_idNumber: { tenantId, idNumber: data.visitorIdNumber } },
    select: { id: true, blacklisted: true, blacklistReason: true },
  })
  if (customer?.blacklisted) {
    throw new GateVisitorBlacklistedError(customer.blacklistReason)
  }

  const entry = await prisma.$transaction(async (tx) => {
    const now = new Date()
    const entryNumber = await generateEntryNumber(tx, now)
    const queueNumber  = data.purpose === 'sell' ? await generateQueueNumber(tx, now) : null
    return tx.gateEntry.create({
      data: {
        tenantId,
        entryNumber,
        queueNumber,
        purpose:           data.purpose,
        categoryNames:     data.purpose === 'sell' ? (data.categoryNames ?? []) : [],
        customerId:        customer?.id ?? null,
        visitorFirstName:  data.visitorFirstName,
        visitorLastName:   data.visitorLastName,
        visitorIdNumber:   data.visitorIdNumber,
        visitorPhone:      data.visitorPhone,
        vehicleReg:        data.vehicleReg,
        idPhotoR2Key:      data.idPhotoR2Key,
        vehiclePhotoR2Key: data.vehiclePhotoR2Key,
        facePhotoR2Key:    data.facePhotoR2Key,
        notes:             data.notes,
        operatorId,
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, customerType: true, blacklisted: true } },
        operator: { select: { id: true, fullName: true } },
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  logger.info({ entryId: entry.id, entryNumber: entry.entryNumber, operatorId, purpose: data.purpose }, 'gateEntry.created')
  return entry
}

// ─── Check out ────────────────────────────────────────────────────────────────

export async function checkoutGateEntry(id: string, exitedById: string) {
  const entry = await prisma.gateEntry.findUnique({ where: { id } })
  if (!entry) throw new GateEntryNotFoundError(id)
  if (entry.exitedAt) throw new GateEntryAlreadyExitedError(entry.entryNumber)

  const updated = await prisma.gateEntry.update({
    where: { id },
    data: { exitedAt: new Date(), exitedById },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, customerType: true } },
      operator: { select: { id: true, fullName: true } },
      exitedBy: { select: { id: true, fullName: true } },
    },
  })
  logger.info({ entryId: id, exitedById }, 'gateEntry.checkedOut')
  return updated
}

// ─── List with filters ────────────────────────────────────────────────────────

export async function listGateEntries(filters: GateEntryFilters) {
  const page     = filters.page     ?? 1
  const pageSize = filters.pageSize ?? 50
  const skip     = (page - 1) * pageSize

  const where: Prisma.GateEntryWhereInput = {}
  if (filters.purpose)    where.purpose  = filters.purpose
  if (filters.onSiteOnly) where.exitedAt = null

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo   ? { lte: new Date(filters.dateTo + 'T23:59:59.999Z') } : {}),
    }
  }

  if (filters.search) {
    const s = filters.search.trim()
    where.OR = [
      { entryNumber:      ciContains(s) },
      { visitorFirstName: ciContains(s) },
      { visitorLastName:  ciContains(s) },
      { vehicleReg:        ciContains(s) },
      { visitorIdNumber:   ciContains(s) },
    ]
  }

  const [entries, total] = await prisma.$transaction(async (tx) => [
    await tx.gateEntry.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, customerType: true } },
        operator: { select: { id: true, fullName: true } },
        exitedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    await tx.gateEntry.count({ where }),
  ])

  return { entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

// ─── Get single entry (with photos) ──────────────────────────────────────────

export async function getGateEntryById(id: string) {
  const entry = await prisma.gateEntry.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, customerType: true } },
      operator: { select: { id: true, fullName: true } },
      exitedBy: { select: { id: true, fullName: true } },
    },
  })
  if (!entry) throw new GateEntryNotFoundError(id)
  return entry
}

// ─── Scale Station queue (queueNumber -> customer/casual auto-fill) ──────────
// A queue number only ever resolves TODAY's own entries — a same-day
// convenience, not a permanent lookup key the way entryNumber is.

export class QueueNumberNotFoundError extends Error {
  constructor(queueNumber: number) {
    super(`No open queue number ${queueNumber} found for today`)
    this.name = 'QueueNumberNotFoundError'
  }
}

export class QueueNumberAlreadyUsedError extends Error {
  constructor(queueNumber: number) {
    super(`Queue number ${queueNumber} has already been used`)
    this.name = 'QueueNumberAlreadyUsedError'
  }
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function getGateEntryByQueueNumber(queueNumber: number) {
  const entry = await prisma.gateEntry.findFirst({
    where: { queueNumber, purpose: 'sell', createdAt: { gte: startOfToday() } },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, phone: true, blacklisted: true, blacklistReason: true } },
    },
  })
  if (!entry) throw new QueueNumberNotFoundError(queueNumber)
  if (entry.customer?.blacklisted) throw new GateVisitorBlacklistedError(entry.customer.blacklistReason)
  if (entry.queueNumberUsedAt) throw new QueueNumberAlreadyUsedError(queueNumber)
  return entry
}

// Today's still-waiting queue — shown at the Scale Station so the operator
// can see who's next and jump straight to them instead of typing a number.
export async function listOpenQueue() {
  return prisma.gateEntry.findMany({
    where: { purpose: 'sell', queueNumber: { not: null }, queueNumberUsedAt: null, createdAt: { gte: startOfToday() } },
    select: {
      id: true, queueNumber: true, entryNumber: true, createdAt: true,
      visitorFirstName: true, visitorLastName: true,
      customer: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { queueNumber: 'asc' },
  })
}

// ─── On-site stats (dashboard tile) ───────────────────────────────────────────

export async function getOnSiteCount() {
  return prisma.gateEntry.count({ where: { exitedAt: null } })
}

export async function listOnSiteEntries(limit = 10) {
  return prisma.gateEntry.findMany({
    where: { exitedAt: null },
    select: {
      id: true, entryNumber: true, purpose: true, vehicleReg: true,
      visitorFirstName: true, visitorLastName: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

// ─── Purpose Config ───────────────────────────────────────────────────────────
// Every tenant gets all 4 purposes present, lazily created with schema
// defaults on first read — mirrors CategoryStepConfig's role for Scale
// Station, just keyed on purpose instead of product category.

export async function listPurposeConfigs() {
  const tenantId = requireTenantId()
  const existing = await prisma.gatePurposeConfig.findMany()
  const byPurpose = new Map(existing.map((c) => [c.purpose, c]))

  for (const purpose of ALL_PURPOSES) {
    if (!byPurpose.has(purpose)) {
      const created = await prisma.gatePurposeConfig.create({ data: { tenantId, purpose } })
      byPurpose.set(purpose, created)
    }
  }

  return ALL_PURPOSES.map((p) => byPurpose.get(p)!)
}

export async function getPurposeConfig(purpose: GateEntryPurpose) {
  const tenantId = requireTenantId()
  const existing = await prisma.gatePurposeConfig.findUnique({ where: { tenantId_purpose: { tenantId, purpose } } })
  if (existing) return existing
  return prisma.gatePurposeConfig.create({ data: { tenantId, purpose } })
}

export async function updatePurposeConfig(purpose: GateEntryPurpose, data: UpdateGatePurposeConfigInput) {
  const tenantId = requireTenantId()
  const existing = await prisma.gatePurposeConfig.findUnique({ where: { tenantId_purpose: { tenantId, purpose } } })
  const updated = existing
    ? await prisma.gatePurposeConfig.update({ where: { id: existing.id }, data })
    : await prisma.gatePurposeConfig.create({ data: { tenantId, purpose, ...data } })
  logger.info({ purpose, ...data }, 'gatePurposeConfig.updated')
  return updated
}

// ─── Sell Options (admin-managed picklist for the "what are they selling?" step) ─
// Independent of ProductCategory — this is a heads-up tag on the visitor log,
// not the actual purchase transaction, so it has its own flat, no-hierarchy
// list rather than reusing the product catalogue's category tree.

export async function listSellOptions(includeInactive = false) {
  return prisma.gateSellOption.findMany({
    where:   includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  })
}

export async function createSellOption(data: CreateSellOptionInput) {
  const tenantId = requireTenantId()
  const existing = await prisma.gateSellOption.findUnique({ where: { tenantId_label: { tenantId, label: data.label } } })
  if (existing) throw new Error(`"${data.label}" already exists`)

  const option = await prisma.gateSellOption.create({
    data: {
      tenantId,
      label:     data.label,
      colorHex:  data.colorHex  || null,
      iconName:  data.iconName  || null,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  logger.info({ optionId: option.id, label: option.label }, 'gateSellOption.created')
  return option
}

export async function updateSellOption(id: string, data: UpdateSellOptionInput) {
  const existing = await prisma.gateSellOption.findUnique({ where: { id } })
  if (!existing) throw new Error('Sell option not found')

  if (data.label && data.label !== existing.label) {
    const conflict = await prisma.gateSellOption.findUnique({
      where: { tenantId_label: { tenantId: requireTenantId(), label: data.label } },
    })
    if (conflict) throw new Error(`"${data.label}" already exists`)
  }

  const updated = await prisma.gateSellOption.update({ where: { id }, data })
  logger.info({ optionId: id, ...data }, 'gateSellOption.updated')
  return updated
}

export async function deleteSellOption(id: string) {
  const existing = await prisma.gateSellOption.findUnique({ where: { id } })
  if (!existing) throw new Error('Sell option not found')
  await prisma.gateSellOption.delete({ where: { id } })
  logger.info({ optionId: id, label: existing.label }, 'gateSellOption.deleted')
}
