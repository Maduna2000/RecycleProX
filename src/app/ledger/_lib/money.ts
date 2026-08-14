// SZL — the ledger's single base currency (design doc: Eswatini's currency
// board pegs SZL 1:1 with ZAR, so a single-currency book is correct in
// practice even though other modules can toggle a cash-up's display currency).
const SYMBOL = 'E'

/** "104550.00" -> "104 550.00" — matches src/lib/reports/format.ts's groupThousands. */
function groupThousands(fixed: string): string {
  const negative = fixed.startsWith('-')
  const [intPart, decPart] = (negative ? fixed.slice(1) : fixed).split('.')
  const grouped = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '-' : ''}${grouped}.${decPart ?? '00'}`
}

/** Accepts a decimal-string (as returned by the ledger report API, already .toFixed(2)). */
export function formatMoney(value: string | number): string {
  const fixed = typeof value === 'number' ? value.toFixed(2) : value
  return `${SYMBOL}${groupThousands(fixed)}`
}
