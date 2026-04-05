import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { generatePoliceRegister, type RegisterEntry } from '@/lib/pdf/policeRegister'

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
    }))

    const pdfBytes = await generatePoliceRegister({
      date:          start,
      entries,
      dealerName:    'Lariat Technologies — RecycleProX',
      dealerAddress: 'Pretoria, Gauteng, South Africa',
      generatedAt:   new Date(),
    })

    const filename = `police-register-${dateParam}.pdf`
    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
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
