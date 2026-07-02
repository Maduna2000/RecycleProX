'use client'

/**
 * Report catalog — cards grouped by area, driven by REPORT_CATALOG. The Cash
 * area also links to the existing per-session Cash-Up report pack.
 */
import Link from 'next/link'
import { FileBarChart2, ExternalLink } from 'lucide-react'
import { REPORT_CATALOG, REPORT_AREA_LABELS } from '@/lib/reports/catalog'
import type { ReportArea } from '@/lib/reports/types'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const AREA_ORDER: ReportArea[] = ['purchases', 'sales', 'cash', 'stock']

interface ReportCatalogProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ReportCatalog({ selectedId, onSelect }: ReportCatalogProps) {
  return (
    <div className="space-y-5">
      {AREA_ORDER.map((area) => {
        const entries = REPORT_CATALOG.filter((r) => r.area === area)
        if (entries.length === 0 && area !== 'cash') return null
        return (
          <div key={area}>
            <h3
              className="mb-2 uppercase tracking-wide"
              style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary }}
            >
              {REPORT_AREA_LABELS[area]}
            </h3>
            <div className="space-y-1.5">
              {entries.map((r) => {
                const active = r.id === selectedId
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className="w-full text-left rounded border px-3 py-2 transition-colors"
                    style={{
                      borderColor: active ? colors.process : colors.border,
                      background: active ? colors.processBg : '#fff',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <FileBarChart2
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: active ? colors.process : colors.textSecondary }}
                      />
                      <span
                        style={{
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.medium,
                          color: active ? colors.process : colors.textPrimary,
                        }}
                      >
                        {r.label}
                      </span>
                    </div>
                    <p className="mt-0.5 ml-5.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginLeft: 22 }}>
                      {r.description}
                    </p>
                  </button>
                )
              })}
              {area === 'cash' && (
                <Link
                  href="/app/cashup"
                  className="block rounded border px-3 py-2 transition-colors"
                  style={{ borderColor: colors.border, background: '#fff' }}
                >
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textSecondary }} />
                    <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
                      Cash-Up Session Reports
                    </span>
                  </div>
                  <p className="mt-0.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginLeft: 22 }}>
                    Per-session report pack (cash sales, cash purchases, expenses, loans…) in the Cash-Up module.
                  </p>
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
