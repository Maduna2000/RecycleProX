/**
 * Stock period boundary calculations
 * Shared utility for stock grid and stock on hand routes
 */

export type StockPeriod = 'daily' | 'weekly' | 'mtd' | 'yearly'

export const STOCK_PERIODS: StockPeriod[] = ['daily', 'weekly', 'mtd', 'yearly']

export function getPeriodBounds(period: StockPeriod, dateParam: string) {
  const [y, m, d] = dateParam.split('-').map(Number)
  const refDate = new Date(y!, m! - 1, d!)

  let periodStart: Date
  const periodEnd = new Date(refDate)
  periodEnd.setHours(23, 59, 59, 999)

  if (period === 'daily') {
    periodStart = new Date(refDate)
    periodStart.setHours(0, 0, 0, 0)
  } else if (period === 'weekly') {
    // Monday–Sunday week containing refDate
    const dow = refDate.getDay() === 0 ? 6 : refDate.getDay() - 1 // 0=Mon
    periodStart = new Date(refDate)
    periodStart.setDate(refDate.getDate() - dow)
    periodStart.setHours(0, 0, 0, 0)
  } else if (period === 'yearly') {
    // YTD: 1 January to refDate
    periodStart = new Date(y!, 0, 1, 0, 0, 0, 0)
  } else {
    // MTD: 1st of the month to refDate
    periodStart = new Date(y!, m! - 1, 1, 0, 0, 0, 0)
  }

  // Opening cutoff: beginning of time (we pull all history to compute opening balance)
  const openingCutoff = new Date(0)

  return { periodStart, periodEnd, openingCutoff }
}
