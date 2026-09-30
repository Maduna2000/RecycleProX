// Tax Invoice date rules. The date printed on a tax invoice is, in order:
//   1. taxInvoiceDate — a manual override set by a manager, else
//   2. the most recent non-voided payment against the sale/purchase, else
//   3. createdAt — a sale/purchase settled at creation has no Payment row, so
//      its creation time is its payment time.
// The yard runs on Eswatini time (SAST, UTC+2, no DST).

const TZ = 'Africa/Johannesburg'
const TZ_OFFSET = '+02:00'

export type TaxInvoiceDateSource = 'override' | 'payment' | 'created'

export function resolveTaxInvoiceDate(args: {
  override: Date | null
  lastPaymentAt: Date | null
  createdAt: Date
}): { date: Date; source: TaxInvoiceDateSource } {
  if (args.override) return { date: args.override, source: 'override' }
  if (args.lastPaymentAt) return { date: args.lastPaymentAt, source: 'payment' }
  return { date: args.createdAt, source: 'created' }
}

/** Date -> "YYYY-MM-DDTHH:mm" in SAST, the value format of <input type="datetime-local">. */
export function toSastInputValue(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/** "YYYY-MM-DDTHH:mm" entered as SAST -> ISO string with explicit offset. */
export function fromSastInputValue(v: string): string {
  return `${v}:00${TZ_OFFSET}`
}
