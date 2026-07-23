'use client'

/**
 * Report catalog — cards grouped by area, driven by REPORT_CATALOG. The Cash
 * area also links to the existing per-session Cash-Up report pack.
 */
import { useState } from 'react'
import Link from 'next/link'
import { FileBarChart2, ExternalLink, Search } from 'lucide-react'
import { REPORT_CATALOG, REPORT_AREA_LABELS } from '@/lib/reports/catalog'
import type { ReportArea } from '@/lib/reports/types'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PANEL, PANEL_HEAD, NAVY, inp } from '@/components/rpx'

const AREA_ORDER: ReportArea[] = ['purchases', 'sales', 'cash', 'stock', 'accounts', 'compliance']

interface ReportCatalogProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ReportCatalog({ selectedId, onSelect }: ReportCatalogProps) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const filtered = term
    ? REPORT_CATALOG.filter((r) => r.label.toLowerCase().includes(term) || r.description.toLowerCase().includes(term))
    : REPORT_CATALOG

  return (
    <div style={{ ...PANEL, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={PANEL_HEAD}>
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.textPrimary }}>Report Catalog</span>
      </div>

      <div style={{ padding: 8, borderBottom: '1px solid #E5E5E5', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 8, top: 8, width: 13, height: 13, color: colors.textSecondary }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            style={{ ...inp, paddingLeft: 26 }}
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {AREA_ORDER.map((area) => {
          const entries = filtered.filter((r) => r.area === area)
          if (entries.length === 0 && area !== 'cash') return null
          return (
            <div key={area}>
              <div
                style={{
                  padding: '7px 10px 5px', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: colors.textSecondary, background: '#FAFAFA',
                  borderTop: '1px solid #E5E5E5', borderBottom: '1px solid #EEE',
                }}
              >
                {REPORT_AREA_LABELS[area]}
              </div>
              {entries.map((r) => {
                const active = r.id === selectedId
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 10px 7px 9px',
                      borderLeft: `3px solid ${active ? NAVY : 'transparent'}`,
                      borderBottom: '1px solid #F2F2F2',
                      background: active ? '#EBF3FC' : 'transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F5F5F5' }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div className="flex items-center gap-2">
                      <FileBarChart2
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: active ? NAVY : colors.textSecondary }}
                      />
                      <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: active ? NAVY : colors.textPrimary }}>
                        {r.label}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: '2px 0 0 22px', fontSize: fontSize.xs, color: colors.textSecondary,
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {r.description}
                    </p>
                  </button>
                )
              })}
              {area === 'cash' && (
                <Link
                  href="/app/cashup"
                  style={{
                    display: 'block', padding: '7px 10px 7px 12px',
                    borderLeft: '3px solid transparent', borderBottom: '1px solid #F2F2F2',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textSecondary }} />
                    <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
                      Cash-Up Session Reports
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 22px', fontSize: fontSize.xs, color: colors.textSecondary }}>
                    Per-session report pack in the Cash-Up module.
                  </p>
                </Link>
              )}
            </div>
          )
        })}
        {term && filtered.length === 0 && (
          <div style={{ padding: '24px 10px', textAlign: 'center', fontSize: fontSize.sm, color: colors.textSecondary }}>
            No reports match &ldquo;{search}&rdquo;.
          </div>
        )}
      </div>
    </div>
  )
}
