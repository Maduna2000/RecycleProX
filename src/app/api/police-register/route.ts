import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { generatePoliceRegister } from '@/lib/pdf/policeRegister'
import { getPurchasesForRegister } from '@/lib/services/policeVisitService'
import { DEFAULT_POLICE_SERVICE_NAME } from '@/lib/police-defaults'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * GET /api/police-register?date=YYYY-MM-DD
 * Returns a PDF of the daily purchase register for the given date.
 * Manager/admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dateParam = req.nextUrl.searchParams.get('date')
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })
  }

  const [y, m, d] = dateParam.split('-').map(Number)
  const date = new Date(y!, m! - 1, d!)

  try {
    const { entries, settings } = await runWithRequestTenant(req, () => getPurchasesForRegister(date))

    const pdfBytes = await generatePoliceRegister({
      date,
      entries,
      dealerName:        settings['yardName']    ?? 'Renovo Pro',
      dealerAddress:     settings['yardAddress'] ?? '—',
      policeServiceName: settings['police_service_name'] ?? DEFAULT_POLICE_SERVICE_NAME,
      generatedAt:       new Date(),
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
