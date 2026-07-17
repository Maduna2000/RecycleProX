import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getVisitForCertificate } from '@/lib/services/policeVisitService'
import { generateInspectionCertificate } from '@/lib/pdf/inspectionCertificate'
import { DEFAULT_POLICE_SERVICE_NAME, DEFAULT_POLICE_LEGAL_NOTE } from '@/lib/police-defaults'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * GET /api/police-visits/[id]/certificate
 * Inspection certificate PDF: officer details, searches performed, signature.
 * Available to staff (the officer downloads it at the end of their session).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const data = await runWithRequestTenant(req, () => getVisitForCertificate(params.id))
    if (!data) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
    const { visit, settings, signatureBytes } = data

    const pdfBytes = await generateInspectionCertificate({
      visitId:           visit.id,
      officerName:       visit.officerName,
      rank:              visit.rank,
      badgeNumber:       visit.badgeNumber,
      stationName:       visit.stationName,
      contactNumber:     visit.contactNumber,
      visitReason:       visit.visitReason,
      visitNote:         visit.visitNote,
      startedAt:         visit.startedAt,
      signedAt:          visit.signedAt,
      status:            visit.status,
      searches:          visit.searchLogs,
      signatureBytes,
      dealerName:        settings['yardName']    ?? 'Renovo Pro',
      dealerAddress:     settings['yardAddress'] ?? '—',
      policeServiceName: settings['police_service_name'] ?? DEFAULT_POLICE_SERVICE_NAME,
      legalNote:         settings['police_legal_note']   ?? DEFAULT_POLICE_LEGAL_NOTE,
      generatedAt:       new Date(),
    })

    const filename = `inspection-certificate-${visit.visitDate.toISOString().slice(0, 10)}-${visit.id.slice(0, 8)}.pdf`
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    logger.error({ err, id: params.id }, 'GET /api/police-visits/[id]/certificate failed')
    return NextResponse.json({ error: 'Failed to generate certificate' }, { status: 500 })
  }
}
