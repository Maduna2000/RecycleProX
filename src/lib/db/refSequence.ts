// Highest numeric sequence among reference numbers of the exact form
// `<prefix><digits>` — the shared read half of every MAX-based ref-number
// generator (scaleService.ts, purchaseService.ts, saleService.ts, ...).
//
// Callers fetch every candidate with findMany({ where: { <field>:
// { startsWith } } }) and pass the values here, instead of
// findFirst({ orderBy: { <field>: 'desc' } }). That orderBy sorts as TEXT,
// which broke in two ways: any existing value that shares the prefix but
// isn't `<prefix><digits>` sorts to the top, parses as NaN and silently
// reset the sequence to 0 (confirmed live — every Scale Station order
// computed "S00001" and hit P2002); and "...-9999" sorts above "...-10000".
// Values that don't match exactly are ignored, so they can never pull the
// result below a real existing sequence.
export function maxRefSeq(refs: readonly string[], prefix: string): number {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped}(\\d+)$`)
  let max = 0
  for (const ref of refs) {
    const match = pattern.exec(ref)
    if (!match) continue
    const seq = parseInt(match[1] as string, 10)
    if (seq > max) max = seq
  }
  return max
}
