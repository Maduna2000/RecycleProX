import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getViewUrl } from '@/lib/r2'

// Photo record shape returned to the client
export type PhotoRecord = {
  type: 'purchase_signature' | 'purchase_vat264' | 'purchase_photo' | 'sale_photo' | 'weighbridge' | 'casual_id'
  transactionId: string
  refNumber?: string
  r2Key: string
  viewUrl: string
  createdAt: string
  customer?: { id: string; firstName: string; lastName: string; idNumber: string }
  product?: { id: string; name: string }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const type       = searchParams.get('type')        // 'purchase' | 'sale' | 'weighbridge' | 'casual'
  const customerId = searchParams.get('customerId')  ?? undefined
  const search     = searchParams.get('search')      ?? undefined
  const product    = searchParams.get('product')     ?? undefined
  const from       = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined
  const to         = searchParams.get('to')   ? new Date(searchParams.get('to')!)   : undefined
  const page       = parseInt(searchParams.get('page')     ?? '1')
  const pageSize   = Math.min(parseInt(searchParams.get('pageSize') ?? '24'), 48)

  try {
    const records: PhotoRecord[] = []

    const dateFilter = (from || to) ? {
      createdAt: {
        ...(from && { gte: from }),
        ...(to   && { lte: to   }),
      },
    } : {}

    // ── Purchase photos (signatures + VAT264) ──────────────────────────────────
    if (!type || type === 'purchase') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchaseWhere: any = {
        ...dateFilter,
        ...(customerId && { customerId }),
        OR: [
          { signatureR2Key: { not: null } },
          { vat264R2Key:    { not: null } },
          { photoR2Keys:    { isEmpty: false } },
        ],
        status: { not: 'voided' },
      }

      if (search) {
        purchaseWhere.AND = [{
          OR: [
            { refNumber:  { contains: search, mode: 'insensitive' } },
            { customer: { firstName: { contains: search, mode: 'insensitive' } } },
            { customer: { lastName:  { contains: search, mode: 'insensitive' } } },
            { customer: { idNumber:  { contains: search, mode: 'insensitive' } } },
          ],
        }]
      }

      if (product) {
        purchaseWhere.lines = { some: { product: { name: { contains: product, mode: 'insensitive' } } } }
      }

      const purchases = await prisma.purchase.findMany({
        where: purchaseWhere,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize * 4,
      })

      for (const p of purchases) {
        if (p.signatureR2Key) {
          records.push({
            type: 'purchase_signature',
            transactionId: p.id,
            refNumber: p.refNumber,
            r2Key: p.signatureR2Key,
            viewUrl: await getViewUrl(p.signatureR2Key),
            createdAt: p.createdAt.toISOString(),
            customer: p.customer ? { ...p.customer, idNumber: p.customer.idNumber ?? '' } : undefined,
          })
        }
        if (p.vat264R2Key) {
          records.push({
            type: 'purchase_vat264',
            transactionId: p.id,
            refNumber: p.refNumber,
            r2Key: p.vat264R2Key,
            viewUrl: await getViewUrl(p.vat264R2Key),
            createdAt: p.createdAt.toISOString(),
            customer: p.customer ? { ...p.customer, idNumber: p.customer.idNumber ?? '' } : undefined,
          })
        }
        for (const key of (p.photoR2Keys ?? [])) {
          records.push({
            type: 'purchase_photo',
            transactionId: p.id,
            refNumber: p.refNumber,
            r2Key: key,
            viewUrl: await getViewUrl(key),
            createdAt: p.createdAt.toISOString(),
            customer: p.customer ? { ...p.customer, idNumber: p.customer.idNumber ?? '' } : undefined,
          })
        }
      }
    }

    // ── Sale photos ────────────────────────────────────────────────────────────
    if (!type || type === 'sale') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saleWhere: any = {
        ...dateFilter,
        ...(customerId && { customerId }),
        photoR2Key: { not: null },
        status: { not: 'voided' },
      }

      if (search) {
        saleWhere.OR = [
          { refNumber:     { contains: search, mode: 'insensitive' } },
          { buyerName:     { contains: search, mode: 'insensitive' } },
          { buyerIdNumber: { contains: search, mode: 'insensitive' } },
          { customer: { firstName: { contains: search, mode: 'insensitive' } } },
          { customer: { lastName:  { contains: search, mode: 'insensitive' } } },
        ]
      }

      if (product) {
        saleWhere.lines = { some: { product: { name: { contains: product, mode: 'insensitive' } } } }
      }

      const sales = await prisma.sale.findMany({
        where: saleWhere,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize * 2,
      })

      for (const s of sales) {
        if (s.photoR2Key) {
          records.push({
            type: 'sale_photo',
            transactionId: s.id,
            refNumber: s.refNumber,
            r2Key: s.photoR2Key,
            viewUrl: await getViewUrl(s.photoR2Key),
            createdAt: s.createdAt.toISOString(),
            customer: s.customer ?? (s.buyerName
              ? { id: '', firstName: s.buyerName, lastName: '', idNumber: s.buyerIdNumber ?? '' }
              : undefined),
          })
        }
      }
    }

    // ── Weighbridge photos (StocktakeEntry) ───────────────────────────────────
    if (!type || type === 'weighbridge') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const weighbridgeWhere: any = {
        photoR2Key: { not: null },
        ...(product && { product: { name: { contains: product, mode: 'insensitive' } } }),
        ...(Object.keys(dateFilter).length && dateFilter),
      }

      const entries = await prisma.stocktakeEntry.findMany({
        where: weighbridgeWhere,
        include: {
          product:   { select: { id: true, name: true } },
          stocktake: { select: { refNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize * 2,
      })

      for (const e of entries) {
        if (e.photoR2Key) {
          records.push({
            type: 'weighbridge',
            transactionId: e.id,
            refNumber: e.stocktake.refNumber,
            r2Key: e.photoR2Key,
            viewUrl: await getViewUrl(e.photoR2Key),
            createdAt: e.createdAt.toISOString(),
            product: e.product,
          })
        }
      }
    }

    // ── Casual ID photos ───────────────────────────────────────────────────────
    if (!type || type === 'casual') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customerWhere: any = {
        idPhotoR2Key: { not: null },
        ...(customerId && { id: customerId }),
      }

      if (search) {
        customerWhere.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName:  { contains: search, mode: 'insensitive' } },
          { idNumber:  { contains: search, mode: 'insensitive' } },
        ]
      }

      const customers = await prisma.customer.findMany({
        where: customerWhere,
        select: {
          id: true, firstName: true, lastName: true,
          idNumber: true, idPhotoR2Key: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize * 2,
      })

      for (const c of customers) {
        if (c.idPhotoR2Key) {
          records.push({
            type: 'casual_id',
            transactionId: c.id,
            r2Key: c.idPhotoR2Key,
            viewUrl: await getViewUrl(c.idPhotoR2Key),
            createdAt: c.createdAt.toISOString(),
            customer: { id: c.id, firstName: c.firstName, lastName: c.lastName, idNumber: c.idNumber },
          })
        }
      }
    }

    // Sort all combined records by date descending, then paginate
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const start     = (page - 1) * pageSize
    const paged     = records.slice(start, start + pageSize)
    const total     = records.length

    return NextResponse.json({
      photos: paged,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/photos/search failed')
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }
}
