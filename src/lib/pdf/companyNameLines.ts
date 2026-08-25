/**
 * Splits a company name at " T/A " (trading-as) onto its own second line —
 * e.g. "GOLDEN KEY INVESTMENT PTY LTD T/A NSIBAZEZULU" prints as two lines
 * instead of running the full length across the header/receipt width.
 * Names without a T/A clause are returned unchanged as a single line.
 */
export function splitCompanyNameLines(name: string): string[] {
  const match = name.match(/^(.*?)\s+(t\/a\s+.+)$/i)
  if (!match) return [name]
  const [, legalName, tradingAs] = match
  return [legalName!.trim(), tradingAs!.trim()]
}
