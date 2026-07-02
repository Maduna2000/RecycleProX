/**
 * Display formatters shared by the PDF engine, Excel engine, and the
 * on-screen preview. Client-safe (no Node-only imports).
 *
 * All date/time rendering pins timeZone to Africa/Johannesburg — the server
 * runs in UTC on Vercel, and bare toLocale* calls there would be 2h off.
 */
import type { ColumnFormat } from './types'

export const REPORT_TZ = 'Africa/Johannesburg'

/** Space-grouped thousands, fixed decimals: 104550 → "104 550.00". */
export function groupThousands(fixed: string): string {
  const [int, frac] = fixed.split('.')
  const neg = int!.startsWith('-')
  const digits = neg ? int!.slice(1) : int!
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${neg ? '-' : ''}${grouped}${frac !== undefined ? '.' + frac : ''}`
}

function toFixedSafe(value: string, dp: number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return n.toFixed(dp)
}

export function formatDateSAST(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-ZA', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function formatTimeSAST(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('en-ZA', { timeZone: REPORT_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function formatDateTimeSAST(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${formatDateSAST(iso)} ${d.toLocaleTimeString('en-ZA', { timeZone: REPORT_TZ, hour: '2-digit', minute: '2-digit', hour12: false })}`
}

/**
 * Render a raw cell string per its column format. Money values get the
 * currency symbol immediately prefixed with space-grouped thousands, matching
 * the legacy report style ("E3 976.00").
 */
export function formatCell(
  value: string | null | undefined,
  format: ColumnFormat | undefined,
  currencySymbol: string
): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (format) {
    case 'money':
      return `${currencySymbol}${groupThousands(toFixedSafe(value, 2))}`
    case 'money6':
      return `${currencySymbol} ${toFixedSafe(value, 6)}`
    case 'mass':
      return groupThousands(toFixedSafe(value, 3))
    case 'qty':
      return groupThousands(toFixedSafe(value, 2))
    case 'int':
      return groupThousands(toFixedSafe(value, 0))
    case 'date':
      return formatDateSAST(value)
    case 'time':
      return formatTimeSAST(value)
    case 'datetime':
      return formatDateTimeSAST(value)
    default:
      return value
  }
}
