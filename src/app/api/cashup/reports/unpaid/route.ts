import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import { generateCashupReport, type ReportEntry } from '@/lib/pdf/cashupReport'
import { getAllSettings } from '@/lib/services/settingsService'
import { getUnpaidPurchases } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const QuerySchema = z.object({
  scope: z.enum(['today', 'all']).default('all'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/**
 * GET /api/cashup/reports/unpaid?scope=all
 * GET /api/cashup/reports/unpaid?scope=today&date=2024-01-15
 *
 * Generates a PDF report for unpaid purchases.
 * - scope=all: All-time unpaid purchases (always available)
 * - scope=today: Today's unpaid purchases (requires date param)
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query params
  const scopeParam = req.nextUrl.searchParams.get('scope') ?? 'all'
  const dateParam = req.nextUrl.searchParams.get('date') ?? undefined

  const parseResult = QuerySchema.safeParse({ scope: scopeParam, date: dateParam })
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const { scope, date } = parseResult.data

  // For 'today' scope, date is required
  let sessionDate: Date | undefined
  if (scope === 'today') {
    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter required for today scope' },
        { status: 400 }
      )
    }
    const [y, m, d] = date.split('-').map(Number)
    sessionDate = new Date(y!, m! - 1, d!)
  }

  try {
    // Get settings for company info + report data
    const [settings, entries] = await runWithRequestTenant(req, () => Promise.all([
      getAllSettings(),
      getUnpaidPurchases(scope, sessionDate) as unknown as Promise<ReportEntry[]>,
    ]))

    const reportType = scope === 'today' ? 'unpaid-today' : 'unpaid-all'
    const reportDate = sessionDate ?? new Date()

    // Generate PDF
    const pdfBytes = await generateCashupReport({
      reportType,
      sessionDate: reportDate,
      currency: 'ZAR',
      currencySymbol: 'R',
      companyName: settings['yardName'] ?? 'Renovo Pro',
      companyAddress: settings['yardAddress'] ?? '',
      companyPhone: settings['yardPhone'] ?? undefined,
      companyVat: settings['yardVat'] ?? undefined,
      generatedAt: new Date(),
      entries,
    })

    const filename = `unpaid-${scope}-${reportDate.toISOString().split('T')[0]}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (err) {
    logger.error({ err, scope, date }, 'GET /api/cashup/reports/unpaid failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
