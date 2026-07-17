import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { getPersonRecordReport, PoliceVisitNotActiveError } from '@/lib/services/policeVisitService'
import { generatePersonRecordReport } from '@/lib/pdf/policeSearchReport'
import { DEFAULT_POLICE_SERVICE_NAME } from '@/lib/police-defaults'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const ParamsSchema = z.object({
  visitId:    z.string().uuid(),
  customerId: z.string().uuid(),
})

/**
 * GET /api/police-search/person/[customerId]/report?visitId=
 * Person Record Report PDF (identity + ID photo + transaction history) for an
 * active inspection session. The download is logged like a search.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = ParamsSchema.safeParse({
    visitId:    req.nextUrl.searchParams.get('visitId'),
    customerId: params.customerId,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const data = await runWithRequestTenant(req, () => getPersonRecordReport(parsed.data.visitId, parsed.data.customerId))
    if (!data) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    const { visit, customer, settings, idPhotoBytes } = data

    const pdfBytes = await generatePersonRecordReport({
      policeServiceName: settings['police_service_name'] ?? DEFAULT_POLICE_SERVICE_NAME,
      dealerName:        settings['yardName']    ?? 'Renovo Pro',
      dealerAddress:     settings['yardAddress'] ?? '—',
      officer: {
        name:        visit.officerName,
        rank:        visit.rank,
        badgeNumber: visit.badgeNumber,
        stationName: visit.stationName,
      },
      generatedAt: new Date(),
      person: {
        fullName:        `${customer.firstName} ${customer.lastName}`,
        idNumber:        customer.idNumber,
        dateOfBirth:     customer.dateOfBirth,
        gender:          customer.gender,
        nationality:     customer.nationality,
        phone:           customer.phone,
        email:           customer.email,
        address:         customer.physicalAddress ?? customer.postalAddress ?? '—',
        blacklisted:     customer.blacklisted,
        blacklistReason: customer.blacklistReason,
        idPhotoBytes,
      },
      purchases: customer.purchases.map((p) => ({
        createdAt:   p.createdAt,
        refNumber:   p.refNumber,
        items:       p.lines.map((l) => `${l.product.name} (${l.quantity}${l.product.unit})`).join(', '),
        totalAmount: p.totalAmount.toString(),
      })),
    })

    const safeName = `${customer.firstName}-${customer.lastName}`.replace(/[^\w-]/g, '')
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="person-record-${safeName}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof PoliceVisitNotActiveError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 409 })
    }
    logger.error({ err, customerId: params.customerId }, 'GET person record report failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
