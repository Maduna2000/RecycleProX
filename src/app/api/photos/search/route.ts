import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getViewUrl } from '@/lib/r2'

// Photo record shape returned to the client
export type PhotoRecord = {
  type: 'purchase_signature' | 'purchase_vat264' | 'casual_id'
  transactionId: string
  refNumber?: string
  r2Key: string
  viewUrl: string
  createdAt: string
  customer?: { id: string; firstName: string; lastName: string; idNumber: string }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const type       = searchParams.get('type')        // 'purchase' | 'casual'
  const customerId = searchParams.get('customerId')  ?? undefined
  const search     = searchParams.get('search')      ?? undefined
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

    const customerFilter = customerId ? { customerId } : {}

    const searchFilter = search ? {
      OR: [
        { refNumber:  { contains: search, mode: 'insensitive' as const } },
        { customer: { firstName: { contains: search, mode: 'insensitive' as const } } },
        { customer: { lastName:  { contains: search, mode: 'insensitive' as const } } },
        { customer: { idNumber:  { contains: search, mode: 'insensitive' as const } } },
      ],
    } : {}

    // ── Purchase photos (signatures + VAT264) ──────────────────────────────────
    if (!type || type === 'purchase') {
      const purchases = await prisma.purchase.findMany({
        where: {
          ...customerFilter,
          ...dateFilter,
          ...(search ? searchFilter : {}),
          OR: [
            { signatureR2Key: { not: null } },
            { vat264R2Key:    { not: null } },
          ],
          status: { not: 'voided' },
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize * 3, // over-fetch; we'll flatten into individual photo records
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
            customer: p.customer,
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
            customer: p.customer,
          })
        }
      }
    }

    // ── Casual ID photos ───────────────────────────────────────────────────────
    if (!type || type === 'casual') {
      const customerWhere = {
        idPhotoR2Key: { not: null },
        customerType: 'casual' as const,
        ...(customerId && { id: customerId }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName:  { contains: search, mode: 'insensitive' as const } },
            { idNumber:  { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      }

      const customers = await prisma.customer.findMany({
        where: customerWhere,
        select: { id: true, firstName: true, lastName: true, idNumber: true, idPhotoR2Key: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
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

    const start  = (page - 1) * pageSize
    const paged  = records.slice(start, start + pageSize)
    const total  = records.length

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
