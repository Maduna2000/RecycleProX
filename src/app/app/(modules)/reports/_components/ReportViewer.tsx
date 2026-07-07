'use client'

/**
 * Report viewer — parameter panel (date range + report-specific filters from
 * the catalog's FilterSpec[]), Run → JSON preview, and PDF/Excel downloads.
 */
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2, X } from 'lucide-react'
import type { ReportCatalogEntry, FilterSpec } from '@/lib/reports/catalog'
import { DEALER_CATEGORY_OPTIONS } from '@/lib/reports/catalog'
import type { ReportDocument } from '@/lib/reports/types'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Label } from '@/components/ui/label'
import { ActionButton } from './ActionButton'
import { DateRangeFilter } from './DateRangeFilter'
import { DownloadButtons } from './DownloadButtons'
import { ReportPreviewTable } from './ReportPreviewTable'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body
}

interface CustomerHit {
  id: string
  firstName: string
  lastName: string
  companyName?: string | null
  idNumber?: string | null
}

function customerLabel(c: CustomerHit): string {
  return c.companyName?.trim() || `${c.firstName} ${c.lastName}`
}

/** Search-as-you-type customer picker backed by /api/customers?search=. */
function CustomerSearchSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (id: string) => void
}) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [chosen, setChosen] = useState<CustomerHit | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 300)
    return () => clearTimeout(t)
  }, [term])

  const { data } = useSWR<{ customers: CustomerHit[] }>(
    open && debounced.length >= 2 ? `/api/customers?search=${encodeURIComponent(debounced)}&limit=10` : null,
    fetcher
  )

  // External reset (e.g. switching reports clears the filter value)
  useEffect(() => {
    if (!value) { setChosen(null); setTerm('') }
  }, [value])

  const active = !!chosen

  return (
    <div className="relative">
      <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>
        {label}
      </Label>
      <div
        className="flex items-center h-9 rounded-md"
        style={{
          border: `1px solid ${active ? colors.process : colors.border}`,
          background: active ? colors.processBg : colors.surface,
          minWidth: 220,
        }}
      >
        <input
          value={chosen ? customerLabel(chosen) : term}
          placeholder="Type to search…"
          onChange={(e) => {
            setChosen(null)
            onChange('')
            setTerm(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none px-2"
          style={{ color: active ? colors.textPrimary : colors.textSecondary, fontWeight: active ? fontWeight.medium : fontWeight.regular }}
        />
        {active && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setChosen(null); setTerm(''); onChange('') }}
            className="flex items-center px-2"
            style={{ color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>
      {open && !chosen && (data?.customers?.length ?? 0) > 0 && (
        <div
          className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded border bg-white shadow"
          style={{ borderColor: colors.border }}
        >
          {data!.customers.map((c) => (
            <button
              key={c.id}
              className="block w-full text-left px-2 py-1.5 hover:bg-gray-100"
              style={{ fontSize: fontSize.sm, color: colors.textPrimary }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setChosen(c)
                setOpen(false)
                onChange(c.id)
              }}
            >
              {customerLabel(c)}
              {c.idNumber && (
                <span className="ml-2" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                  {c.idNumber}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Shared select for report filters — the "active" (non-default) state is
 * shown via a tinted fill + accent border, so a glance at the filter row
 * shows exactly which filters are currently narrowing the report.
 */
function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  const active = !!value
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md px-2 text-sm cursor-pointer outline-none"
      style={{
        border: `1px solid ${active ? colors.process : colors.border}`,
        background: active ? colors.processBg : colors.surface,
        color: active ? colors.textPrimary : colors.textSecondary,
        fontWeight: active ? fontWeight.medium : fontWeight.regular,
        minWidth: 170,
      }}
    >
      {children}
    </select>
  )
}

/** Product picker — full list loaded once (products list is small). */
function ProductSelect({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  required?: boolean
}) {
  const { data } = useSWR<{ products: { id: string; code: string; name: string }[] }>(
    '/api/products',
    fetcher
  )
  return (
    <div>
      <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>
        {label}
      </Label>
      <FilterSelect value={value} onChange={onChange}>
        {!required && <option value="">All products</option>}
        {(data?.products ?? []).map((p) => (
          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
        ))}
      </FilterSelect>
    </div>
  )
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
  if (spec.type === 'customer') {
    return <CustomerSearchSelect label={spec.label} value={value} onChange={onChange} />
  }
  if (spec.type === 'product') {
    return <ProductSelect label={spec.label} value={value} onChange={onChange} required={spec.required} />
  }

  const options =
    spec.type === 'dealerCategory' ? DEALER_CATEGORY_OPTIONS : spec.options ?? []

  return (
    <div>
      <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>
        {spec.label}
      </Label>
      <FilterSelect value={value} onChange={onChange}>
        {!spec.required && <option value="">All</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </FilterSelect>
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

  const missingRequired = report.filters.filter((f) => f.required && !filters[f.key])
  const hasActiveFilters = Object.values(filters).some(Boolean)

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

        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Filters
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFilters({})}
                style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.process, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
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
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <ActionButton variant="primary" onClick={handleRun} disabled={isLoading || missingRequired.length > 0}>
            {isLoading
              ? <><Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> Running…</>
              : 'Run Report'}
          </ActionButton>
          <DownloadButtons reportId={report.id} params={params} disabled={isLoading || missingRequired.length > 0} />
          {missingRequired.length > 0 && (
            <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
              Select {missingRequired.map((f) => f.label).join(', ')} to run this report.
            </span>
          )}
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
