import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { generatePoliceRegister, type RegisterEntry } from '@/lib/pdf/policeRegister'
import { fetchR2Bytes } from '@/lib/r2'

/**
 * GET /api/police-register?date=YYYY-MM-DD
 * Returns a PDF of the daily purchase register for the given date.
 * Manager/admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dateParam = req.nextUrl.searchParams.get('date')
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })
  }

  const [y, m, d] = dateParam.split('-').map(Number)
  const start = new Date(y!, m! - 1, d!)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)

  try {
    const purchases = await prisma.purchase.findMany({
      where: {
        status: 'completed',
        createdAt: { gte: start, lte: end },
      },
      include: {
        customer: true,
        lines: { include: { product: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Fetch customer ID photos from R2 in parallel (best-effort)
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

    const settings = await prisma.systemSettings.findMany()
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

    const pdfBytes = await generatePoliceRegister({
      date:          start,
      entries,
      dealerName:    settingsMap['yardName']    ?? 'RecycleProX',
      dealerAddress: settingsMap['yardAddress'] ?? 'Pretoria, Gauteng, South Africa',
      generatedAt:   new Date(),
    })

    const filename = `police-register-${dateParam}.pdf`
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    logger.error({ err, date: dateParam }, 'GET /api/police-register failed')
    return NextResponse.json({ error: 'Failed to generate register' }, { status: 500 })
  }
}
