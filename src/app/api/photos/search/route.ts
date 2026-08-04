import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getViewUrl } from '@/lib/r2'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// Photo record shape returned to the client
export type PhotoRecord = {
  type: 'purchase_signature' | 'purchase_photo' | 'sale_photo' | 'weighbridge' | 'casual_id'
  transactionId: string
  refNumber?: string
  r2Key: string
  viewUrl: string
  createdAt: string
  customer?: { id: string; firstName: string; lastName: string; idNumber: string }
  product?: { id: string; name: string }
}

const PHOTO_VIEWER_ROLES = ['admin', 'manager', 'cashier']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!PHOTO_VIEWER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
    const records: PhotoRecord[] = await runWithRequestTenant(req, async () => {
    const records: PhotoRecord[] = []

    const dateFilter = (from || to) ? {
      createdAt: {
        ...(from && { gte: from }),
        ...(to   && { lte: to   }),
      },
    } : {}

    // ── Purchase photos (signatures + scale-station product photos) ────────────
    // VAT264 is deliberately not surfaced here — it's downloaded from the
    // purchase record itself, not the Photo Viewer.
    if (!type || type === 'purchase') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchaseWhere: any = {
        ...dateFilter,
        ...(customerId && { customerId }),
        OR: [
          { signatureR2Key: { not: null } },
          {
            status: 'completed',
            hasOutstandingBalance: false,
            scaleOrder: { photoR2Keys: { isEmpty: false } },
          },
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
          customer:   { select: { id: true, firstName: true, lastName: true, idNumber: true } },
          scaleOrder: { select: { photoR2Keys: true } },
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
        // Product photos come exclusively from the scale-station order this
        // purchase was weighed from — not the purchase module's own ad-hoc
        // "add photo" upload — and only once the purchase is completed and
        // fully paid, since that's the confirmation this scale order really
        // did become this purchase (matched by customer, products, weight).
        const isPaidPurchase  = p.status === 'completed' && !p.hasOutstandingBalance
        const productPhotoKeys = isPaidPurchase ? (p.scaleOrder?.photoR2Keys ?? []) : []
        for (const key of productPhotoKeys) {
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
            customer: s.customer
              ? { ...s.customer, idNumber: s.customer.idNumber ?? '' }
              : (s.buyerName
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

    // ── ID photos (account + casual) ──────────────────────────────────────────
    // Sourced from the customer profile's Documents tab (CustomerDocument,
    // documentType 'id_copy') — the same source of truth as the Account/Casual
    // ID Upload Status reports — not the older idPhotoR2Key field.
    if (!type || type === 'casual') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docWhere: any = {
        documentType: 'id_copy',
        ...(customerId && { customerId }),
      }

      if (search) {
        docWhere.customer = {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName:  { contains: search, mode: 'insensitive' } },
            { idNumber:  { contains: search, mode: 'insensitive' } },
          ],
        }
      }

      const idDocs = await prisma.customerDocument.findMany({
        where: docWhere,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        },
        orderBy: { uploadedAt: 'desc' },
        take: pageSize * 2,
      })

      for (const d of idDocs) {
        records.push({
          type: 'casual_id',
          transactionId: d.customerId,
          r2Key: d.r2Key,
          viewUrl: await getViewUrl(d.r2Key),
          createdAt: d.uploadedAt.toISOString(),
          customer: { id: d.customer.id, firstName: d.customer.firstName, lastName: d.customer.lastName, idNumber: d.customer.idNumber ?? '' },
        })
      }
    }

    return records
    })

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
