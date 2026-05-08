import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import { getViewUrl, fetchR2Bytes } from '@/lib/r2'
import type { RegisterEntry } from '@/lib/pdf/policeRegister'

export async function listPoliceVisits(opts: { limit: number; offset: number }) {
  const [visits, total] = await Promise.all([
    prisma.policeVisit.findMany({
      orderBy: { visitDate: 'desc' },
      take:    opts.limit,
      skip:    opts.offset,
    }),
    prisma.policeVisit.count(),
  ])

  const visitsWithUrls = await Promise.all(
    visits.map(async (v) => ({
      ...v,
      registerUrl:  v.registerR2Key  ? await getViewUrl(v.registerR2Key,  3600) : null,
      signatureUrl: v.signatureR2Key ? await getViewUrl(v.signatureR2Key, 3600) : null,
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
    data: { ...data, createdByUserId },
  })
  logger.info({ visitId: visit.id, createdByUserId }, 'police-visit.created')
  return visit
}

export async function getPoliceVisit(id: string) {
  const visit = await prisma.policeVisit.findUnique({ where: { id } })
  if (!visit) return null

  return {
    ...visit,
    registerUrl:  visit.registerR2Key  ? await getViewUrl(visit.registerR2Key,  3600) : null,
    signatureUrl: visit.signatureR2Key ? await getViewUrl(visit.signatureR2Key, 3600) : null,
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

export async function getPurchasesForRegister(date: Date): Promise<{
  entries: RegisterEntry[]
  settings: Record<string, string>
}> {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end   = new Date(date); end.setHours(23, 59, 59, 999)

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
