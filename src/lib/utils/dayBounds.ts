// South Africa (ZAR) and Eswatini (SZL) are both fixed UTC+2 year-round — no DST —
// so a constant offset is exact and permanent. These helpers make "which calendar
// day is this" and "what's today" independent of the server process's own
// timezone (which differs between local dev, Pretoria/SAST, and Vercel/UTC).
const SAST_OFFSET_HOURS = 2

// Deterministically turns a "YYYY-MM-DD" label into a Date for storing into a
// @db.Date column — using Date.UTC so the same string always produces the same
// stored calendar date regardless of the running process's local timezone.
export function sastDateLabelToUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0))
}

// Normalizes an arbitrary Date to its calendar-day label, read via UTC getters
// (so it doesn't matter what timezone the server process thinks it's in), then
// re-encodes it the same deterministic way.
export function normalizeToDateLabel(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

// Returns the UTC instant range covering the SAST calendar day encoded in `date`
// (extracted via UTC getters) — for use as createdAt: { gte: start, lte: end }.
export function getDayBoundsSAST(date: Date): { start: Date; end: Date } {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const d = date.getUTCDate()
  const start = new Date(Date.UTC(y, m, d, -SAST_OFFSET_HOURS, 0, 0, 0))
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { start, end }
}

// "What date is it right now, in SAST" — shifts the current UTC instant by the
// fixed offset before extracting the calendar day.
export function todaySASTDateStr(): string {
  const shifted = new Date(Date.now() + SAST_OFFSET_HOURS * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// "Today", in SAST, as a Date suitable for a @db.Date column / equality lookup.
export function todaySASTDate(): Date {
  return sastDateLabelToUTCDate(todaySASTDateStr())
}

// UTC instant range covering an inclusive SAST calendar-day range — start of
// the `from` day through end of the `to` day. All report builders use this;
// none do their own date math.
export function getRangeBoundsSAST(fromLabel: string, toLabel: string): { start: Date; end: Date } {
  const { start } = getDayBoundsSAST(sastDateLabelToUTCDate(fromLabel))
  const { end } = getDayBoundsSAST(sastDateLabelToUTCDate(toLabel))
  return { start, end }
}

// The SAST calendar-day label ("YYYY-MM-DD") an arbitrary instant falls on —
// for bucketing rows into days in per-day reports.
export function sastDayLabelOfInstant(date: Date): string {
  const shifted = new Date(date.getTime() + SAST_OFFSET_HOURS * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
