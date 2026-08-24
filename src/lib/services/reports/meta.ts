/**
 * Shared ReportMeta assembly — company branding and currency symbol, both
 * from SystemSettings (see the "currency" key, the single system-wide
 * currency every module reads from).
 */
import { getAllSettings, currencySymbolFromSettings } from '@/lib/services/settingsService'
import type { ReportMeta } from '@/lib/reports/types'

export async function buildReportMeta(generatedBy: string): Promise<Omit<ReportMeta, 'rowCount'>> {
  const settings = await getAllSettings()
  const currencySymbol = currencySymbolFromSettings(settings)

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
