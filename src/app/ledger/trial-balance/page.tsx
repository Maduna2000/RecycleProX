'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PortalPage, TH, TD, Field, inp, HEADER_GRAD } from '@/components/rpx'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatMoney } from '../_lib/money'
import { StatCard } from '../_components/StatCard'
import { Pagination } from '../_components/Pagination'
import type { TrialBalanceReport } from '@/lib/services/ledgerReportService'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(todayLabel())
  const [page, setPage] = useState(1)
  const { data, isLoading } = useSWR<TrialBalanceReport>(`/api/ledger/trial-balance?asOf=${asOf}&page=${page}`, fetcher)

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Trial Balance</h1>
          <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>
            Every account&apos;s own postings, as of a date — total debits must equal total credits.
          </p>
        </div>
        <Field label="As of">
          <input type="date" value={asOf} max={todayLabel()} onChange={(e) => { setAsOf(e.target.value); setPage(1) }} style={{ ...inp, width: 170 }} />
        </Field>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Accounts with Activity" value={String(data.accountCount)} />
          <StatCard label="Total Debit" value={formatMoney(data.totalDebit)} />
          <StatCard label="Total Credit" value={formatMoney(data.totalCredit)} />
        </div>
      )}

      {data && (
        <div
          className="flex items-center gap-2"
          style={{
            padding: '10px 14px', borderRadius: 6, fontSize: fontSize.base, fontWeight: fontWeight.semibold,
            background: data.balanced ? colors.actionBg : colors.dangerBg,
            color: data.balanced ? colors.action : colors.danger,
          }}
        >
          {data.balanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {data.balanced ? 'Balanced — debits equal credits.' : 'Not balanced — this indicates a bug in posting logic, not a data-entry error (every entry is enforced balanced at post time).'}
        </div>
      )}

      <PortalPage title="Trial Balance">
        <div style={{ overflow: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
          ) : !data || data.rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>No activity posted as of this date.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Code</th>
                  <th style={TH}>Account</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.accountId} style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
                    <td style={{ ...TD, fontFamily: 'monospace', color: colors.textSecondary }}>{r.code}</td>
                    <td style={TD}>{r.name}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{Number(r.debit) > 0 ? formatMoney(r.debit) : ''}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{Number(r.credit) > 0 ? formatMoney(r.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${colors.border}`, background: HEADER_GRAD }}>
                  <td colSpan={2} style={{ ...TD, textAlign: 'right', fontWeight: fontWeight.semibold }}>Total</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right' }}>{formatMoney(data.totalDebit)}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right' }}>{formatMoney(data.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        {data && <Pagination page={data.page} pageCount={data.pageCount} total={data.accountCount} itemLabel="accounts" onChange={setPage} />}
      </PortalPage>
    </div>
  )
}
