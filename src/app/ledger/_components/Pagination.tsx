import { colors, fontSize } from '@/lib/design-tokens'

const pagerBtn: React.CSSProperties = {
  fontSize: fontSize.sm, padding: '4px 12px', border: `1px solid ${colors.border}`, borderRadius: 3,
  background: colors.surface, cursor: 'pointer',
}

/** Shared Previous/Next pager — matches the Journal page's original pattern, reused across every paginated ledger table. */
export function Pagination({
  page, pageCount, total, itemLabel = 'entries', onChange,
}: {
  page: number
  pageCount: number
  total: number
  itemLabel?: string
  onChange: (page: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Page {page} of {pageCount} ({total} {itemLabel})</span>
      <div className="flex gap-2">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} style={pagerBtn}>Previous</button>
        <button onClick={() => onChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount} style={pagerBtn}>Next</button>
      </div>
    </div>
  )
}
