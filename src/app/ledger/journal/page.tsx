'use client'

import { useState, Fragment } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PortalPage, TH, TD, Field, inp } from '@/components/rpx'
import { DateRangeFilter } from '../_components/DateRangeFilter'
import { StatCard } from '../_components/StatCard'
import { Pagination } from '../_components/Pagination'
import { formatMoney } from '../_lib/money'
import type { JournalEntryRow } from '@/lib/services/ledgerReportService'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}
function monthStartLabel(): string {
  return todayLabel().slice(0, 8) + '01'
}

const SOURCE_TYPES = [
  '', 'purchase', 'purchase_settlement', 'sale', 'sale_settlement', 'expense',
  'loan_advance', 'loan_repayment', 'business_loan', 'business_loan_repayment',
  'cashup_variance', 'stocktake_adjustment', 'float_movement', 'opening_balance',
]

export default function JournalPage() {
  const [from, setFrom] = useState(monthStartLabel())
  const [to, setTo] = useState(todayLabel())
  const [sourceType, setSourceType] = useState('')
  const [page, setPage] = useState(1)

  const query = new URLSearchParams({ from, to, page: String(page), ...(sourceType ? { sourceType } : {}) })
  const { data, isLoading } = useSWR<{ entries: JournalEntryRow[]; total: number; totalDebit: string; totalCredit: string; page: number; pageCount: number }>(
    `/api/ledger/journal?${query.toString()}`,
    fetcher
  )

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div>
        <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Journal</h1>
        <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>The raw chronological feed of every posted entry.</p>
      </div>

      <div className="flex items-end flex-wrap gap-4">
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1) }} />
        <Field label="Source type" width={200}>
          <select value={sourceType} onChange={(e) => { setSourceType(e.target.value); setPage(1) }} style={{ ...inp, width: '100%' }}>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
          </select>
        </Field>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Entries" value={String(data.total)} />
          <StatCard label="Total Debit" value={formatMoney(data.totalDebit)} />
          <StatCard label="Total Credit" value={formatMoney(data.totalCredit)} />
        </div>
      )}

      <PortalPage title="Journal">
        <div style={{ overflow: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
          ) : !data || data.entries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>No entries in this range.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Date</th>
                  <th style={TH}>Description</th>
                  <th style={TH}>Source</th>
                  <th style={TH}>Account</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <Fragment key={entry.id}>
                    {entry.lines.map((l, i) => (
                      <tr key={`${entry.id}-${i}`} style={{ borderBottom: i === entry.lines.length - 1 ? `1px solid ${colors.border}` : `1px solid ${colors.rowDivider}` }}>
                        {i === 0 && (
                          <>
                            <td style={TD} rowSpan={entry.lines.length}>{new Date(entry.entryDate).toLocaleDateString()}</td>
                            <td style={TD} rowSpan={entry.lines.length}>{entry.description}</td>
                            <td style={{ ...TD, color: colors.textSecondary, fontSize: fontSize.sm }} rowSpan={entry.lines.length}>{entry.sourceType}</td>
                          </>
                        )}
                        <td style={{ ...TD, color: colors.textSecondary }}>{l.accountCode} — {l.accountName}</td>
                        <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{Number(l.debit) > 0 ? formatMoney(l.debit) : ''}</td>
                        <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{Number(l.credit) > 0 ? formatMoney(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data && <Pagination page={data.page} pageCount={data.pageCount} total={data.total} onChange={setPage} />}
      </PortalPage>
    </div>
  )
}
