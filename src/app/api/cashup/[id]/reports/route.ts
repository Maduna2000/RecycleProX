import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CashupReportQuerySchema, type CashupReportType } from '@/lib/schemas/cashup'
import { generateCashupReport, type ReportEntry } from '@/lib/pdf/cashupReport'
import { getAllSettings, currencySymbolFromSettings } from '@/lib/services/settingsService'
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
import { getSessionWindow, type DateWindow } from '@/lib/services/cashUpWindow'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

class CashUpNotFoundForReportError extends Error {}
class CashUpNotReportableError extends Error {}

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
    const { cashUp, settings, entries } = await runWithRequestTenant(req, async () => {
      // Fetch cashup session
      const cashUp = await getCashUp(id)
      if (!cashUp) throw new CashUpNotFoundForReportError()

      // Reports are date-scoped queries, not a read of the finalized cashup
      // totals, so they work for the currently-running (open) session too —
      // only a voided session has no meaningful report to generate.
      if (cashUp.status === 'voided') throw new CashUpNotReportableError()

      // Get settings for company info
      const settings = await getAllSettings()

      // Scoped to this session's own reconciliation window, not the whole
      // calendar day — a day can hold more than one session (separate
      // shifts) — except unpaid-today/unpaid-all, which stay day/global.
      const window = await getSessionWindow(prisma, cashUp)

      // Fetch report data based on type
      const entries = await getReportData(reportType, window, cashUp.sessionDate)

      return { cashUp, settings, entries }
    })

    const currencySymbol = currencySymbolFromSettings(settings)

    // Generate PDF
    const pdfBytes = await generateCashupReport({
      reportType,
      sessionDate: cashUp.sessionDate,
      currency: cashUp.currency,
      currencySymbol,
      companyName: settings['yardName'] ?? 'Renovo Pro',
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
    if (err instanceof CashUpNotFoundForReportError) {
      return NextResponse.json({ error: 'Cash-up session not found' }, { status: 404 })
    }
    if (err instanceof CashUpNotReportableError) {
      return NextResponse.json(
        { error: 'Reports are not available for a voided session' },
        { status: 400 }
      )
    }
    logger.error({ err, cashUpId: id, reportType }, 'GET /api/cashup/[id]/reports failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}

async function getReportData(
  reportType: CashupReportType,
  window: DateWindow,
  sessionDate: Date
): Promise<ReportEntry[]> {
  switch (reportType) {
    case 'cash-sales':
      return getCashSalesForDate(window) as unknown as Promise<ReportEntry[]>

    case 'cash-purchases':
      return getCashPurchasesForDate(window) as unknown as Promise<ReportEntry[]>

    case 'account-payments':
      return getAccountPaymentsForDate(window) as unknown as Promise<ReportEntry[]>

    case 'expenses':
      return getExpensesForDateReport(window) as unknown as Promise<ReportEntry[]>

    case 'loan-advances':
      return getLoanAdvancesForDate(window) as unknown as Promise<ReportEntry[]>

    case 'loan-repayments':
      return getLoanRepaymentsForDate(window) as unknown as Promise<ReportEntry[]>

    case 'unpaid-today':
      return getUnpaidPurchases('today', sessionDate) as unknown as Promise<ReportEntry[]>

    case 'unpaid-all':
      return getUnpaidPurchases('all') as unknown as Promise<ReportEntry[]>

    case 'card-sales':
      return getCardSalesForDate(window) as unknown as Promise<ReportEntry[]>

    case 'transferred-purchases':
      return getTransferredPurchasesForDate(window) as unknown as Promise<ReportEntry[]>

    case 'drawings-received':
      return getDrawingsReceivedForDateReport(window) as unknown as Promise<ReportEntry[]>

    default:
      return []
  }
}
