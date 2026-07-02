'use client'

/**
 * Report viewer — parameter panel (date range + report-specific filters from
 * the catalog's FilterSpec[]), Run → JSON preview, and PDF/Excel downloads.
 */
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import type { ReportCatalogEntry, FilterSpec } from '@/lib/reports/catalog'
import { DEALER_CATEGORY_OPTIONS } from '@/lib/reports/catalog'
import type { ReportDocument } from '@/lib/reports/types'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Label } from '@/components/ui/label'
import { LegacyButton } from './LegacyButton'
import { DateRangeFilter } from './DateRangeFilter'
import { DownloadButtons } from './DownloadButtons'
import { ReportPreviewTable } from './ReportPreviewTable'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body
}

function FilterControl({
  spec,
  value,
  onChange,
}: {
  spec: FilterSpec
  value: string
  onChange: (v: string) => void
}) {
  const options =
    spec.type === 'dealerCategory' ? DEALER_CATEGORY_OPTIONS : spec.options ?? []

  return (
    <div>
      <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>
        {spec.label}
      </Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded border px-2 text-sm bg-white"
        style={{ borderColor: colors.border, color: colors.textPrimary, minWidth: 160 }}
      >
        {!spec.required && <option value="">All</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

interface ReportViewerProps {
  report: ReportCatalogEntry
}

export function ReportViewer({ report }: ReportViewerProps) {
  const today = new Date().toISOString().split('T')[0]!
  const monthStart = today.substring(0, 8) + '01'

  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [query, setQuery] = useState<string | null>(null)

  // Switching reports resets filters and clears the preview
  useEffect(() => {
    setFilters({})
    setQuery(null)
  }, [report.id])

  const params = useMemo(() => {
    const p: Record<string, string> = { from, to }
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v
    return p
  }, [from, to, filters])

  const { data, isLoading, error } = useSWR<ReportDocument>(
    query ? `/api/reports/${report.id}?${query}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  function handleRun() {
    setQuery(new URLSearchParams({ ...params, format: 'json' }).toString())
  }

  return (
    <div className="space-y-4">
      <div className="rounded border bg-white p-4 space-y-3" style={{ borderColor: colors.border }}>
        <div>
          <h2 style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
            {report.label}
          </h2>
          <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{report.description}</p>
        </div>

        <div className="flex flex-wrap items-end gap-3" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
          {report.filters.map((spec) => (
            <FilterControl
              key={spec.key}
              spec={spec}
              value={filters[spec.key] ?? ''}
              onChange={(v) => setFilters((prev) => ({ ...prev, [spec.key]: v }))}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <LegacyButton onClick={handleRun} disabled={isLoading}>
            {isLoading
              ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Running…</>
              : 'Run Report'}
          </LegacyButton>
          <DownloadButtons reportId={report.id} params={params} disabled={isLoading} />
          {data && (
            <span className="ml-auto" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
              {data.meta.rowCount} row{data.meta.rowCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs px-4 py-3 rounded" style={{ background: colors.dangerBg, color: colors.danger }}>
          {error instanceof Error ? error.message : 'Failed to load report.'}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-10" style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Building report…
        </div>
      )}

      {data && !isLoading && <ReportPreviewTable doc={data} />}

      {!data && !isLoading && !error && (
        <div
          className="rounded border bg-white px-4 py-10 text-center"
          style={{ borderColor: colors.border, fontSize: fontSize.sm, color: colors.textSecondary }}
        >
          Set the date range and filters, then Run Report to preview — or download directly.
        </div>
      )}
    </div>
  )
}
