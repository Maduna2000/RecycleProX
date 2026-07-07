/**
 * Shared ReportMeta assembly — company branding from SystemSettings and the
 * yard's operating currency symbol (taken from the most recent cash-up
 * session, since currency is configured per cash-up; defaults to R).
 */
import { prisma } from '@/lib/db/prisma'
import { getAllSettings } from '@/lib/services/settingsService'
import { CURRENCY_SYMBOLS } from '@/lib/schemas/cashup'
import type { ReportMeta } from '@/lib/reports/types'

export async function buildReportMeta(generatedBy: string): Promise<Omit<ReportMeta, 'rowCount'>> {
  const [settings, latestCashUp] = await Promise.all([
    getAllSettings(),
    prisma.cashUp.findFirst({ orderBy: { sessionDate: 'desc' }, select: { currency: true } }),
  ])

  const currencySymbol =
    CURRENCY_SYMBOLS[latestCashUp?.currency as keyof typeof CURRENCY_SYMBOLS] ?? 'R'

  return {
    generatedAt: new Date().toISOString(),
    generatedBy,
    company: {
      name: settings['yardName'] ?? 'Renovo Pro',
      address: settings['yardAddress'] ?? '',
      phone: settings['yardPhone'] ?? undefined,
      vat: settings['yardVat'] ?? settings['vatNumber'] ?? undefined,
    },
    currencySymbol,
  }
}
