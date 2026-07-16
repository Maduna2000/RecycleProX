import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import type { Prisma, PoliceVisit } from '@prisma/client'
import logger from '@/lib/logger'
import { getViewUrl, fetchR2Bytes } from '@/lib/r2'
import type { RegisterEntry } from '@/lib/pdf/policeRegister'
import type {
  BeginInspectionInput,
  EndInspectionInput,
} from '@/lib/schemas/police'
import { ciContains } from '@/lib/db/queryHelpers'
import { decodePhotoKeys } from '@/lib/offline/photoKeysCodec'

/** Idle window after which an active inspection session expires (15 minutes). */
export const INSPECTION_IDLE_TIMEOUT_MS = 15 * 60_000

/** View-URL generation must never break a register search (e.g. R2 unconfigured). */
async function safeViewUrl(key: string | null | undefined, ttlSeconds = 3600): Promise<string | null> {
  if (!key) return null
  try {
    return await getViewUrl(key, ttlSeconds)
  } catch (err) {
    logger.warn({ err, key }, 'police.view-url-failed')
    return null
  }
}

/** Thrown when a search targets a visit that is not (or no longer) active. */
export class PoliceVisitNotActiveError extends Error {
  constructor(public readonly reason: 'not_found' | 'ended' | 'expired') {
    super(
      reason === 'not_found' ? 'Inspection session not found'
      : reason === 'expired' ? 'Inspection session has expired'
      :                        'Inspection session has ended'
    )
    this.name = 'PoliceVisitNotActiveError'
  }
}

// ─── Visit listing / CRUD (staff side) ───────────────────────────────────────

export async function listPoliceVisits(opts: { limit: number; offset: number }) {
  await expireStaleVisits()

  const [visits, total] = await Promise.all([
    prisma.policeVisit.findMany({
      orderBy: { createdAt: 'desc' },
      take:    opts.limit,
      skip:    opts.offset,
      include: { searchLogs: { orderBy: { createdAt: 'asc' } } },
    }),
    prisma.policeVisit.count(),
  ])

  const userIds = Array.from(
    new Set(visits.map((v) => v.launchedByUserId).filter((id): id is string => !!id))
  )
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : []
  const userMap = new Map(users.map((u) => [u.id, u.fullName]))

  const visitsWithUrls = await Promise.all(
    visits.map(async (v) => ({
      ...v,
      launchedByName: v.launchedByUserId ? userMap.get(v.launchedByUserId) ?? null : null,
      registerUrl:  await safeViewUrl(v.registerR2Key),
      signatureUrl: await safeViewUrl(v.signatureR2Key),
    }))
  )

  return { visits: visitsWithUrls, total }
}

export async function createPoliceVisit(
  data: {
    visitDate:      Date
    officerName:    string
    badgeNumber?:   string
    stationName?:   string
    registerR2Key?: string
    signatureR2Key?: string
    notes?:         string
  },
  createdByUserId: string
) {
  const visit = await prisma.policeVisit.create({
    data: { ...data, tenantId: requireTenantId(), createdByUserId },
  })
  logger.info({ visitId: visit.id, createdByUserId }, 'police-visit.created')
  return visit
}

export async function getPoliceVisit(id: string) {
  const visit = await prisma.policeVisit.findUnique({
    where:   { id },
    include: { searchLogs: { orderBy: { createdAt: 'asc' } } },
  })
  if (!visit) return null

  return {
    ...visit,
    registerUrl:  await safeViewUrl(visit.registerR2Key),
    signatureUrl: await safeViewUrl(visit.signatureR2Key),
  }
}

export async function updatePoliceVisit(
  id: string,
  data: { signatureR2Key?: string; notes?: string },
  updatedByUserId: string
) {
  const visit = await prisma.policeVisit.update({ where: { id }, data })
  logger.info({ visitId: id, updatedByUserId }, 'police-visit.updated')
  return visit
}

// ─── Inspection session lifecycle (officer portal) ───────────────────────────

/** Officer registers at the portal — opens an active inspection session. */
export async function beginInspection(data: BeginInspectionInput, launchedByUserId: string) {
  const now = new Date()
  // UTC midnight of the local calendar date — @db.Date truncates the UTC value,
  // so local midnight would land on the previous day in TZs ahead of UTC.
  const visitDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

  const visit = await prisma.policeVisit.create({
    data: {
      tenantId:      requireTenantId(),
      visitDate,
      officerName:   data.officerName,
      rank:          data.rank,
      badgeNumber:   data.badgeNumber,
      stationName:   data.stationName,
      contactNumber: data.contactNumber,
      visitReason:   data.visitReason,
      visitNote:     data.visitNote,
      status:        'active',
      startedAt:     now,
      launchedByUserId,
    },
  })
  logger.info(
    { visitId: visit.id, officerName: data.officerName, badgeNumber: data.badgeNumber, launchedByUserId },
    'police-inspection.started'
  )
  return visit
}

/** Officer signs off, or a manager force-ends an abandoned session. */
export async function endInspection(id: string, data: EndInspectionInput, endedByUserId: string) {
  const visit = await prisma.policeVisit.findUnique({ where: { id } })
  if (!visit) throw new PoliceVisitNotActiveError('not_found')
  if (visit.status !== 'active') throw new PoliceVisitNotActiveError(visit.status === 'expired' ? 'expired' : 'ended')

  const updated = await prisma.policeVisit.update({
    where: { id },
    data: data.action === 'sign'
      ? { status: 'completed', signedAt: new Date(), signatureR2Key: data.signatureR2Key }
      : { status: 'expired' },
  })
  logger.info({ visitId: id, action: data.action, endedByUserId }, 'police-inspection.ended')
  return updated
}

/** Expire active sessions idle past the timeout. Last activity = latest search, else start. */
export async function expireStaleVisits(): Promise<number> {
  const cutoff = new Date(Date.now() - INSPECTION_IDLE_TIMEOUT_MS)
  const staleCandidates = await prisma.policeVisit.findMany({
    where:   { status: 'active', startedAt: { lt: cutoff } },
    include: { searchLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  const staleIds = staleCandidates
    .filter((v) => {
      const lastActivity = v.searchLogs[0]?.createdAt ?? v.startedAt
      return lastActivity !== null && lastActivity < cutoff
    })
    .map((v) => v.id)

  if (staleIds.length === 0) return 0

  const { count } = await prisma.policeVisit.updateMany({
    where: { id: { in: staleIds }, status: 'active' },
    data:  { status: 'expired' },
  })
  if (count > 0) logger.info({ count, visitIds: staleIds }, 'police-inspection.expired-stale')
  return count
}

/**
 * Load a visit and assert it is an active, non-idle session.
 * Marks it expired (and throws) if the idle window has lapsed.
 */
export async function getActiveVisitOrThrow(visitId: string): Promise<PoliceVisit> {
  const visit = await prisma.policeVisit.findUnique({
    where:   { id: visitId },
    include: { searchLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!visit) throw new PoliceVisitNotActiveError('not_found')
  if (visit.status === 'expired') throw new PoliceVisitNotActiveError('expired')
  if (visit.status !== 'active') throw new PoliceVisitNotActiveError('ended')

  const lastActivity = visit.searchLogs[0]?.createdAt ?? visit.startedAt ?? visit.createdAt
  if (Date.now() - lastActivity.getTime() > INSPECTION_IDLE_TIMEOUT_MS) {
    await prisma.policeVisit.update({ where: { id: visitId }, data: { status: 'expired' } })
    logger.info({ visitId }, 'police-inspection.expired-on-access')
    throw new PoliceVisitNotActiveError('expired')
  }
  return visit
}

// ─── Register searches (officer portal) ───────────────────────────────────────

function dayStart(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0)
}
function dayEnd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999)
}

async function photoUrls(keys: string[]): Promise<string[]> {
  const urls = await Promise.all(keys.map((k) => safeViewUrl(k)))
  return urls.filter((u): u is string => u !== null)
}

export type RegisterSearchRow = {
  purchaseId:   string
  createdAt:    Date
  refNumber:    string
  supplierName: string
  idNumber:     string | null
  dateOfBirth:  Date | null
  address:      string
  blacklisted:  boolean
  lines:        { productName: string; quantity: string; unit: string }[]
  totalAmount:  string
  idPhotoUrl:   string | null
  photoUrls:    string[]
}

/** Register by date range. Logs the search atomically with the result count. */
export async function searchRegisterByDate(
  visitId: string,
  from: string,
  to: string
): Promise<{ rows: RegisterSearchRow[] }> {
  await getActiveVisitOrThrow(visitId)
  const start = dayStart(from)
  const end   = dayEnd(to)

  const purchases = await prisma.$transaction(async (tx) => {
    const found = await tx.purchase.findMany({
      where:   { status: 'completed', createdAt: { gte: start, lte: end } },
      include: { customer: true, lines: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    })
    await tx.policeSearchLog.create({
      data: {
        tenantId: requireTenantId(),
        visitId,
        searchType:  'register_by_date',
        queryText:   from === to ? from : `${from} to ${to}`,
        resultCount: found.length,
      },
    })
    return found
  })

  const rows: RegisterSearchRow[] = await Promise.all(
    purchases.map(async (p) => ({
      purchaseId:   p.id,
      createdAt:    p.createdAt,
      refNumber:    p.refNumber,
      supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
      idNumber:     p.customer.idNumber,
      dateOfBirth:  p.customer.dateOfBirth,
      address:      p.customer.physicalAddress ?? p.customer.postalAddress ?? '—',
      blacklisted:  p.customer.blacklisted,
      lines: p.lines.map((l) => ({
        productName: l.product.name,
        quantity:    l.quantity.toString(),
        unit:        l.product.unit,
      })),
      totalAmount: p.totalAmount.toString(),
      idPhotoUrl:  await safeViewUrl(p.customer.idPhotoR2Key),
      photoUrls:   await photoUrls(decodePhotoKeys(p.photoR2Keys)),
    }))
  )
  return { rows }
}

export type PersonSearchRow = {
  customerId:      string
  fullName:        string
  idNumber:        string | null
  phone:           string
  address:         string | null
  blacklisted:     boolean
  blacklistReason: string | null
  idPhotoUrl:      string | null
  purchaseCount:   number
  lastPurchaseAt:  Date | null
}

/** Person search by name or ID number. Logs the search atomically. */
export async function searchPersons(visitId: string, q: string): Promise<{ rows: PersonSearchRow[] }> {
  await getActiveVisitOrThrow(visitId)

  const where: Prisma.CustomerWhereInput = {
    OR: [
      { firstName: ciContains(q) },
      { lastName:  ciContains(q) },
      { idNumber:  ciContains(q) },
      { companyName: ciContains(q) },
    ],
  }

  const customers = await prisma.$transaction(async (tx) => {
    const found = await tx.customer.findMany({
      where,
      take:    50,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        _count:    { select: { purchases: { where: { status: 'completed' } } } },
        purchases: { where: { status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    })
    await tx.policeSearchLog.create({
      data: { tenantId: requireTenantId(), visitId, searchType: 'person', queryText: q, resultCount: found.length },
    })
    return found
  })

  const rows: PersonSearchRow[] = await Promise.all(
    customers.map(async (c) => ({
      customerId:      c.id,
      fullName:        c.companyName ? `${c.firstName} ${c.lastName} (${c.companyName})` : `${c.firstName} ${c.lastName}`,
      idNumber:        c.idNumber,
      phone:           c.phone,
      address:         c.physicalAddress ?? c.postalAddress,
      blacklisted:     c.blacklisted,
      blacklistReason: c.blacklistReason,
      idPhotoUrl:      await safeViewUrl(c.idPhotoR2Key),
      purchaseCount:   c._count.purchases,
      lastPurchaseAt:  c.purchases[0]?.createdAt ?? null,
    }))
  )
  return { rows }
}

export type PersonDetail = {
  customer: {
    customerId:      string
    fullName:        string
    idNumber:        string | null
    dateOfBirth:     Date | null
    gender:          string | null
    nationality:     string | null
    phone:           string
    email:           string | null
    physicalAddress: string | null
    postalAddress:   string | null
    blacklisted:     boolean
    blacklistReason: string | null
    idPhotoUrl:      string | null
  }
  purchases: {
    purchaseId:  string
    refNumber:   string
    createdAt:   Date
    totalAmount: string
    lines:       { productName: string; quantity: string; unit: string }[]
    photoUrls:   string[]
  }[]
}

/** Full person profile + transaction history. Logged as a profile disclosure. */
export async function getPersonDetail(visitId: string, customerId: string): Promise<PersonDetail | null> {
  await getActiveVisitOrThrow(visitId)

  const customer = await prisma.$transaction(async (tx) => {
    const found = await tx.customer.findUnique({
      where:   { id: customerId },
      include: {
        purchases: {
          where:   { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take:    100,
          include: { lines: { include: { product: true } } },
        },
      },
    })
    await tx.policeSearchLog.create({
      data: {
        tenantId: requireTenantId(),
        visitId,
        searchType:  'person',
        queryText:   found
          ? `profile: ${found.firstName} ${found.lastName}${found.idNumber ? ` (${found.idNumber})` : ''}`
          : `profile: unknown customer ${customerId}`,
        resultCount: found ? 1 : 0,
      },
    })
    return found
  })

  if (!customer) return null

  return {
    customer: {
      customerId:      customer.id,
      fullName:        `${customer.firstName} ${customer.lastName}`,
      idNumber:        customer.idNumber,
      dateOfBirth:     customer.dateOfBirth,
      gender:          customer.gender,
      nationality:     customer.nationality,
      phone:           customer.phone,
      email:           customer.email,
      physicalAddress: customer.physicalAddress,
      postalAddress:   customer.postalAddress,
      blacklisted:     customer.blacklisted,
      blacklistReason: customer.blacklistReason,
      idPhotoUrl:      await safeViewUrl(customer.idPhotoR2Key),
    },
    purchases: await Promise.all(
      customer.purchases.map(async (p) => ({
        purchaseId:  p.id,
        refNumber:   p.refNumber,
        createdAt:   p.createdAt,
        totalAmount: p.totalAmount.toString(),
        lines: p.lines.map((l) => ({
          productName: l.product.name,
          quantity:    l.quantity.toString(),
          unit:        l.product.unit,
        })),
        photoUrls: await photoUrls(decodePhotoKeys(p.photoR2Keys)),
      }))
    ),
  }
}

export type GoodsSearchRow = {
  purchaseId:   string
  refNumber:    string
  createdAt:    Date
  supplierName: string
  idNumber:     string | null
  blacklisted:  boolean
  quantity:     string
  unit:         string
  lineTotal:    string
  photoUrls:    string[]
}

/** Goods search: all purchase lines of a product in range. Logs atomically. */
export async function searchGoods(
  visitId: string,
  opts: { productId: string; from?: string; to?: string; minQuantity?: number }
): Promise<{ rows: GoodsSearchRow[]; productName: string | null }> {
  await getActiveVisitOrThrow(visitId)

  const createdAt: Prisma.DateTimeFilter | undefined =
    opts.from || opts.to
      ? {
          ...(opts.from ? { gte: dayStart(opts.from) } : {}),
          ...(opts.to   ? { lte: dayEnd(opts.to) }     : {}),
        }
      : undefined

  const { lines, product } = await prisma.$transaction(async (tx) => {
    const foundProduct = await tx.product.findUnique({ where: { id: opts.productId }, select: { name: true, unit: true } })
    const foundLines = await tx.purchaseLine.findMany({
      where: {
        productId: opts.productId,
        ...(opts.minQuantity ? { quantity: { gte: opts.minQuantity } } : {}),
        purchase: { status: 'completed', ...(createdAt ? { createdAt } : {}) },
      },
      include: { purchase: { include: { customer: true } }, product: true },
      orderBy: { createdAt: 'desc' },
      take:    200,
    })
    const rangeText = [opts.from, opts.to].filter(Boolean).join(' to ') || 'all dates'
    await tx.policeSearchLog.create({
      data: {
        tenantId: requireTenantId(),
        visitId,
        searchType:  'goods',
        queryText:   `${foundProduct?.name ?? opts.productId} · ${rangeText}${opts.minQuantity ? ` · min ${opts.minQuantity}` : ''}`,
        resultCount: foundLines.length,
      },
    })
    return { lines: foundLines, product: foundProduct }
  })

  const rows: GoodsSearchRow[] = await Promise.all(
    lines.map(async (l) => ({
      purchaseId:   l.purchaseId,
      refNumber:    l.purchase.refNumber,
      createdAt:    l.purchase.createdAt,
      supplierName: `${l.purchase.customer.firstName} ${l.purchase.customer.lastName}`,
      idNumber:     l.purchase.customer.idNumber,
      blacklisted:  l.purchase.customer.blacklisted,
      quantity:     l.quantity.toString(),
      unit:         l.product.unit,
      lineTotal:    l.lineTotal.toString(),
      photoUrls:    await photoUrls(decodePhotoKeys(l.purchase.photoR2Keys)),
    }))
  )
  return { rows, productName: product?.name ?? null }
}

// ─── Search-result report data (officer downloads) ───────────────────────────

/**
 * Person record report: full identity details + ID photo bytes + transaction
 * history. The download is logged against the visit like a search.
 */
export async function getPersonRecordReport(visitId: string, customerId: string) {
  const visit = await getActiveVisitOrThrow(visitId)

  const customer = await prisma.$transaction(async (tx) => {
    const found = await tx.customer.findUnique({
      where:   { id: customerId },
      include: {
        purchases: {
          where:   { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take:    200,
          include: { lines: { include: { product: true } } },
        },
      },
    })
    await tx.policeSearchLog.create({
      data: {
        tenantId: requireTenantId(),
        visitId,
        searchType:  'person',
        queryText:   found
          ? `report: ${found.firstName} ${found.lastName}${found.idNumber ? ` (${found.idNumber})` : ''}`
          : `report: unknown customer ${customerId}`,
        resultCount: found ? found.purchases.length : 0,
      },
    })
    return found
  })

  if (!customer) return null

  const [settingsRows, idPhotoBytes] = await Promise.all([
    prisma.systemSettings.findMany(),
    customer.idPhotoR2Key
      ? fetchR2Bytes(customer.idPhotoR2Key).catch((err) => {
          logger.warn({ err, customerId }, 'police.report-id-photo-fetch-failed')
          return null
        })
      : Promise.resolve(null),
  ])
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))

  logger.info({ visitId, customerId, officerName: visit.officerName }, 'police-report.person-downloaded')
  return { visit, customer, settings, idPhotoBytes }
}

/**
 * Goods trace report: purchase lines of a product across a date range.
 * The download is logged against the visit like a search.
 */
export async function getGoodsTraceReport(
  visitId: string,
  opts: { productId: string; from?: string; to?: string; minQuantity?: number }
) {
  const visit = await getActiveVisitOrThrow(visitId)

  const createdAt: Prisma.DateTimeFilter | undefined =
    opts.from || opts.to
      ? {
          ...(opts.from ? { gte: dayStart(opts.from) } : {}),
          ...(opts.to   ? { lte: dayEnd(opts.to) }     : {}),
        }
      : undefined

  const { lines, product } = await prisma.$transaction(async (tx) => {
    const foundProduct = await tx.product.findUnique({
      where:  { id: opts.productId },
      select: { name: true, unit: true },
    })
    const foundLines = await tx.purchaseLine.findMany({
      where: {
        productId: opts.productId,
        ...(opts.minQuantity ? { quantity: { gte: opts.minQuantity } } : {}),
        purchase: { status: 'completed', ...(createdAt ? { createdAt } : {}) },
      },
      include: { purchase: { include: { customer: true } }, product: true },
      orderBy: { createdAt: 'desc' },
      take:    500,
    })
    const rangeText = [opts.from, opts.to].filter(Boolean).join(' to ') || 'all dates'
    await tx.policeSearchLog.create({
      data: {
        tenantId: requireTenantId(),
        visitId,
        searchType:  'goods',
        queryText:   `report: ${foundProduct?.name ?? opts.productId} · ${rangeText}${opts.minQuantity ? ` · min ${opts.minQuantity}` : ''}`,
        resultCount: foundLines.length,
      },
    })
    return { lines: foundLines, product: foundProduct }
  })

  if (!product) return null

  const settingsRows = await prisma.systemSettings.findMany()
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))

  logger.info({ visitId, productId: opts.productId, officerName: visit.officerName }, 'police-report.goods-downloaded')
  return { visit, product, lines, settings }
}

// ─── Certificate data ─────────────────────────────────────────────────────────

export async function getVisitForCertificate(id: string) {
  const visit = await prisma.policeVisit.findUnique({
    where:   { id },
    include: { searchLogs: { orderBy: { createdAt: 'asc' } } },
  })
  if (!visit) return null

  const [settingsRows, signatureBytes] = await Promise.all([
    prisma.systemSettings.findMany(),
    visit.signatureR2Key
      ? fetchR2Bytes(visit.signatureR2Key).catch((err) => {
          logger.warn({ err, visitId: id }, 'police.certificate-signature-fetch-failed')
          return null
        })
      : Promise.resolve(null),
  ])
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))

  return { visit, settings, signatureBytes }
}

// ─── Daily register PDF data (existing staff flow) ────────────────────────────

export async function getPurchasesForRegisterRange(start: Date, end: Date): Promise<{
  entries: RegisterEntry[]
  settings: Record<string, string>
}> {
  const [purchases, settingsRows] = await Promise.all([
    prisma.purchase.findMany({
      where:   { status: 'completed', createdAt: { gte: start, lte: end } },
      include: { customer: true, lines: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.systemSettings.findMany(),
  ])

  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))

  const photoMap = new Map<string, Uint8Array | null>()
  await Promise.all(
    purchases
      .filter((p) => p.customer.idPhotoR2Key)
      .map(async (p) => {
        const bytes = await fetchR2Bytes(p.customer.idPhotoR2Key!)
        photoMap.set(p.customer.id, bytes)
      })
  )

  const entries: RegisterEntry[] = purchases.map((p, i) => ({
    rowNumber:    i + 1,
    createdAt:    p.createdAt,
    refNumber:    p.refNumber,
    supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
    idNumber:     p.customer.idNumber,
    dateOfBirth:  p.customer.dateOfBirth,
    policeRegNo:  p.customer.policeRegisterNo,
    address:      p.customer.physicalAddress ?? p.customer.postalAddress ?? '—',
    items:        p.lines.map((l) => `${l.product.name} (${l.quantity}${l.product.unit})`).join(', '),
    totalAmount:  p.totalAmount.toString(),
    idPhotoBytes: photoMap.get(p.customer.id) ?? null,
  }))

  return { entries, settings }
}

export async function getPurchasesForRegister(date: Date): Promise<{
  entries: RegisterEntry[]
  settings: Record<string, string>
}> {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end   = new Date(date); end.setHours(23, 59, 59, 999)
  return getPurchasesForRegisterRange(start, end)
}
