import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CashupReportQuerySchema, type CashupReportType, CASHUP_REPORT_LABELS } from '@/lib/schemas/cashup'
import { CURRENCY_SYMBOLS } from '@/lib/schemas/cashup'
import { generateCashupReport, type ReportEntry } from '@/lib/pdf/cashupReport'
import { getAllSettings } from '@/lib/services/settingsService'
import {
  getCashUp,
  getCashSalesForDate,
  getCashPurchasesForDate,
  getAccountPaymentsForDate,
  getExpensesForDateReport,
  getLoanAdvancesForDate,
  getLoanRepaymentsForDate,
  getUnpaidPurchases,
  getCardSalesForDate,
  getTransferredPurchasesForDate,
  getDrawingsReceivedForDateReport,
} from '@/lib/services/cashUpService'

/**
 * GET /api/cashup/[id]/reports?type=cash-sales
 * Generates a PDF report for the specified cashup session and report type.
 * Only available for submitted or approved sessions.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Validate report type
  const typeParam = req.nextUrl.searchParams.get('type')
  const parseResult = CashupReportQuerySchema.safeParse({ type: typeParam })
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid report type', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const reportType = parseResult.data.type

  try {
    // Fetch cashup session
    const cashUp = await getCashUp(id)
    if (!cashUp) {
      return NextResponse.json({ error: 'Cash-up session not found' }, { status: 404 })
    }

    // Only allow reports for submitted or approved sessions
    if (!['submitted', 'approved'].includes(cashUp.status)) {
      return NextResponse.json(
        { error: 'Reports only available for submitted or approved sessions' },
        { status: 400 }
      )
    }

    // Get settings for company info
    const settings = await getAllSettings()

    // Fetch report data based on type
    const entries = await getReportData(reportType, cashUp.sessionDate)

    const currencySymbol = CURRENCY_SYMBOLS[cashUp.currency as keyof typeof CURRENCY_SYMBOLS] ?? 'R'

    // Generate PDF
    const pdfBytes = await generateCashupReport({
      reportType,
      sessionDate: cashUp.sessionDate,
      currency: cashUp.currency,
      currencySymbol,
      companyName: settings['yardName'] ?? 'RecycleProX',
      companyAddress: settings['yardAddress'] ?? '',
      companyPhone: settings['yardPhone'] ?? undefined,
      companyVat: settings['yardVat'] ?? undefined,
      generatedAt: new Date(),
      entries,
    })

    const filename = `${reportType}-${cashUp.sessionDate.toISOString().split('T')[0]}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (err) {
    logger.error({ err, cashUpId: id, reportType }, 'GET /api/cashup/[id]/reports failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}

async function getReportData(
  reportType: CashupReportType,
  sessionDate: Date
): Promise<ReportEntry[]> {
  switch (reportType) {
    case 'cash-sales':
      return getCashSalesForDate(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'cash-purchases':
      return getCashPurchasesForDate(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'account-payments':
      return getAccountPaymentsForDate(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'expenses':
      return getExpensesForDateReport(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'loan-advances':
      return getLoanAdvancesForDate(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'loan-repayments':
      return getLoanRepaymentsForDate(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'unpaid-today':
      return getUnpaidPurchases('today', sessionDate) as unknown as Promise<ReportEntry[]>

    case 'unpaid-all':
      return getUnpaidPurchases('all') as unknown as Promise<ReportEntry[]>

    case 'card-sales':
      return getCardSalesForDate(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'transferred-purchases':
      return getTransferredPurchasesForDate(sessionDate) as unknown as Promise<ReportEntry[]>

    case 'drawings-received':
      return getDrawingsReceivedForDateReport(sessionDate) as unknown as Promise<ReportEntry[]>

    default:
      return []
  }
}
