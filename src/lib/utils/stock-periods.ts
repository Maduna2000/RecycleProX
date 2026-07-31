/**
 * Stock period boundary calculations
 * Shared utility for stock grid and stock on hand routes
 */
import { sastDateLabelToUTCDate, getDayBoundsSAST, getRangeBoundsSAST } from './dayBounds'

export type StockPeriod = 'daily' | 'weekly' | 'mtd' | 'yearly'

export const STOCK_PERIODS: StockPeriod[] = ['daily', 'weekly', 'mtd', 'yearly']

function dateLabel(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function getPeriodBounds(period: StockPeriod, dateParam: string) {
  const [y, m, d] = dateParam.split('-').map(Number) as [number, number, number]

  let periodStart: Date
  let periodEnd: Date

  if (period === 'daily') {
    const bounds = getDayBoundsSAST(sastDateLabelToUTCDate(dateParam))
    periodStart = bounds.start
    periodEnd = bounds.end
  } else if (period === 'weekly') {
    // Monday-Sunday week containing dateParam. Computed from the label's own
    // y/m/d components (pure calendar math, not an instant), so there's no
    // SAST/UTC ambiguity in figuring out which day of the week it lands on.
    const refDate = new Date(Date.UTC(y, m - 1, d))
    const dow = refDate.getUTCDay() === 0 ? 6 : refDate.getUTCDay() - 1 // 0=Mon
    const monday = new Date(Date.UTC(y, m - 1, d - dow))
    const sunday = new Date(Date.UTC(y, m - 1, d - dow + 6))
    const bounds = getRangeBoundsSAST(
      dateLabel(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
      dateLabel(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate()),
    )
    periodStart = bounds.start
    periodEnd = bounds.end
  } else if (period === 'yearly') {
    // YTD: 1 January to dateParam
    const bounds = getRangeBoundsSAST(dateLabel(y, 1, 1), dateParam)
    periodStart = bounds.start
    periodEnd = bounds.end
  } else {
    // MTD: 1st of the month to dateParam
    const bounds = getRangeBoundsSAST(dateLabel(y, m, 1), dateParam)
    periodStart = bounds.start
    periodEnd = bounds.end
  }

  // Opening cutoff: beginning of time (we pull all history to compute opening balance)
  const openingCutoff = new Date(0)

  return { periodStart, periodEnd, openingCutoff }
}
