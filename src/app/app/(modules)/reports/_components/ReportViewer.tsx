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
import { PANEL, PANEL_HEAD, NAVY, inp, lbl, winBevel } from '@/components/rpx'
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
  customerType,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  customerType?: 'account' | 'casual'
}) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [chosen, setChosen] = useState<CustomerHit | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 300)
    return () => clearTimeout(t)
  }, [term])

  const typeParam = customerType ? `&type=${customerType}` : ''
  const { data } = useSWR<{ customers: CustomerHit[] }>(
    open && debounced.length >= 2 ? `/api/customers?search=${encodeURIComponent(debounced)}&limit=10${typeParam}` : null,
    fetcher
  )

  // External reset (e.g. switching reports clears the filter value)
  useEffect(() => {
    if (!value) { setChosen(null); setTerm('') }
  }, [value])

  const active = !!chosen

  return (
    <div style={{ position: 'relative', minWidth: 220 }}>
      <label style={lbl}>{label}</label>
      <div
        style={{
          display: 'flex', alignItems: 'center', height: 30,
          borderRadius: 2, background: active ? '#EBF3FC' : '#fff',
          ...winBevel(true),
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
          style={{
            flex: 1, minWidth: 0, background: 'transparent', fontSize: 13, outline: 'none',
            border: 'none', padding: '0 8px',
            color: active ? colors.textPrimary : colors.textSecondary,
            fontWeight: active ? fontWeight.medium : fontWeight.regular,
          }}
        />
        {active && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setChosen(null); setTerm(''); onChange('') }}
            style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>
      {open && !chosen && (data?.customers?.length ?? 0) > 0 && (
        <div
          style={{
            position: 'absolute', zIndex: 20, marginTop: 2, width: '100%', maxHeight: 224, overflowY: 'auto',
            borderRadius: 2, background: '#fff', boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
            ...winBevel(),
          }}
        >
          {data!.customers.map((c) => (
            <button
              key={c.id}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: fontSize.sm, color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              onClick={() => {
                setChosen(c)
                setOpen(false)
                onChange(c.id)
              }}
            >
              {customerLabel(c)}
              {c.idNumber && (
                <span style={{ marginLeft: 8, fontSize: fontSize.xs, color: colors.textSecondary }}>
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
 * shown via a tinted fill + navy border, so a glance at the filter row
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
      style={{
        ...inp, width: 'auto', minWidth: 170, cursor: 'pointer',
        // Same sunken structure as `inp`, but the dark corner of the bevel
        // swaps to navy when active — keeps the "tinted fill + navy
        // border" active signal without flattening the bevel back to a
        // uniform borderColor (which would erase the raised/sunken edge).
        borderTop: `1px solid ${active ? NAVY : '#B0B0B0'}`,
        borderLeft: `1px solid ${active ? NAVY : '#B0B0B0'}`,
        borderRight: '1px solid #FFFFFF', borderBottom: '1px solid #FFFFFF',
        background: active ? '#EBF3FC' : '#fff',
        color: active ? colors.textPrimary : colors.textSecondary,
        fontWeight: active ? fontWeight.medium : fontWeight.regular,
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
      <label style={lbl}>{label}</label>
      <FilterSelect value={value} onChange={onChange}>
        {required
          ? <option value="" disabled hidden>Select a product…</option>
          : <option value="">All products</option>}
        {(data?.products ?? []).map((p) => (
          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
        ))}
      </FilterSelect>
    </div>
  )
}

interface CashupHistoryHit {
  id: string
  sessionDate: string
  status: string
  currency: string
}

/** Cash-up session picker — backed by /api/cashup/history, newest first. */
function CashupSelect({
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
  const { data } = useSWR<{ sessions: CashupHistoryHit[] }>(
    '/api/cashup/history?status=open,submitted,approved&take=100',
    fetcher
  )
  return (
    <div>
      <label style={lbl}>{label}</label>
      <FilterSelect value={value} onChange={onChange}>
        <option value="" disabled={required} hidden={required}>Select a session…</option>
        {(data?.sessions ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.sessionDate.slice(0, 10).replace(/-/g, '/')} — {s.status.toUpperCase()}
          </option>
        ))}
      </FilterSelect>
    </div>
  )
}

/** Plain free-text filter — e.g. a partial ID number or transaction number search. */
function TextFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const active = !!value
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type to filter…"
        style={{
          ...inp, width: 170,
          borderTop: `1px solid ${active ? NAVY : '#B0B0B0'}`,
          borderLeft: `1px solid ${active ? NAVY : '#B0B0B0'}`,
          borderRight: '1px solid #FFFFFF', borderBottom: '1px solid #FFFFFF',
          background: active ? '#EBF3FC' : '#fff',
          color: active ? colors.textPrimary : colors.textSecondary,
          fontWeight: active ? fontWeight.medium : fontWeight.regular,
        }}
      />
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
    return <CustomerSearchSelect label={spec.label} value={value} onChange={onChange} customerType={spec.customerType} />
  }
  if (spec.type === 'product') {
    return <ProductSelect label={spec.label} value={value} onChange={onChange} required={spec.required} />
  }
  if (spec.type === 'text') {
    return <TextFilter label={spec.label} value={value} onChange={onChange} />
  }
  if (spec.type === 'cashup') {
    return <CashupSelect label={spec.label} value={value} onChange={onChange} required={spec.required} />
  }

  const options =
    spec.type === 'dealerCategory' ? DEALER_CATEGORY_OPTIONS : spec.options ?? []

  return (
    <div>
      <label style={lbl}>{spec.label}</label>
      <FilterSelect value={value} onChange={onChange}>
        {spec.required
          ? <option value="" disabled hidden>Select…</option>
          : <option value="">All</option>}
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
    <div className="space-y-3">
      <div style={PANEL}>
        <div style={PANEL_HEAD}>
          <span style={{ fontSize: 12, fontWeight: 700, color: colors.textPrimary }}>{report.label}</span>
          <p style={{ margin: '2px 0 0', fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.regular }}>
            {report.description}
          </p>
        </div>

        <div style={{ padding: '10px 12px', borderBottom: '1px solid #E5E5E5' }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ ...lbl, marginBottom: 0 }}>Filters</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFilters({})}
                style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Clear filters
              </button>
            )}
          </div>
          {/*
            One row, always — every report shares this layout, and a report
            with 2+ filters (Stock Movement, Scale Discrepancy, Sellers ID
            Upload Status, ...) alongside the date range's own from/to/quick-
            range trio easily needs 1000px+, more than the window reliably
            has. Wrapping to a second line made those reports look
            inconsistent next to reports with 0-1 filters, which never
            wrapped. Scrolling horizontally instead keeps every report's
            filter row exactly one line tall (flexShrink: 0 on each control
            so it keeps its intended width rather than getting squeezed);
            the themed scrollbar is the same one already used for wide
            tables/pages app-wide (see globals.css).
          */}
          <div className="flex items-end gap-3" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ flexShrink: 0 }}>
              <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
            </div>
            {report.filters.map((spec) => (
              <div key={spec.key} style={{ flexShrink: 0 }}>
                <FilterControl
                  spec={spec}
                  value={filters[spec.key] ?? ''}
                  onChange={(v) => setFilters((prev) => ({ ...prev, [spec.key]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ padding: '10px 12px' }}>
          <ActionButton onClick={handleRun} disabled={isLoading || missingRequired.length > 0}>
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
          style={{ ...PANEL, padding: '40px 16px', textAlign: 'center', fontSize: fontSize.sm, color: colors.textSecondary }}
        >
          Set the date range and filters, then Run Report to preview — or download directly.
        </div>
      )}
    </div>
  )
}
