'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PortalPage, TH, TD, Field, inp } from '@/components/rpx'
import { DateRangeFilter } from '../_components/DateRangeFilter'
import { formatMoney } from '../_lib/money'
import type { AccountTreeNode } from '@/lib/services/ledgerReportService'
import type { GeneralLedgerReport } from '@/lib/services/ledgerReportService'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}
function monthStartLabel(): string {
  return todayLabel().slice(0, 8) + '01'
}

function flatten(nodes: AccountTreeNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.code}  ${n.name}` },
    ...flatten(n.children, depth + 1),
  ])
}

function GeneralLedgerInner() {
  const searchParams = useSearchParams()
  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '')
  const [from, setFrom] = useState(monthStartLabel())
  const [to, setTo] = useState(todayLabel())

  const { data: accountsData } = useSWR<{ accounts: AccountTreeNode[] }>('/api/ledger/accounts', fetcher)
  const options = useMemo(() => (accountsData ? flatten(accountsData.accounts) : []), [accountsData])

  // Pre-select the first account once the list loads, if none chosen yet
  // (e.g. arriving from the nav bar rather than a Chart of Accounts link).
  useEffect(() => {
    if (!accountId && options.length > 0) setAccountId(options[0]!.id)
  }, [accountId, options])

  const { data, isLoading } = useSWR<GeneralLedgerReport>(
    accountId ? `/api/ledger/general-ledger/${accountId}?from=${from}&to=${to}` : null,
    fetcher
  )

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div>
        <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>General Ledger</h1>
        <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>One account&apos;s full activity, chronologically, with a running balance.</p>
      </div>

      <div className="flex items-end flex-wrap gap-4">
        <Field label="Account" width={320}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...inp, width: '100%' }}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      <PortalPage title="General Ledger">
        <div style={{ overflow: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
          ) : !data ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Select an account.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Date</th>
                  <th style={TH}>Description</th>
                  <th style={TH}>Source</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Credit</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${colors.rowDivider}`, background: colors.bg }}>
                  <td colSpan={5} style={{ ...TD, fontWeight: fontWeight.semibold }}>Opening Balance</td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', fontWeight: fontWeight.semibold }}>{formatMoney(data.openingBalance)}</td>
                </tr>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: colors.textMuted, padding: 24 }}>No activity in this period.</td></tr>
                ) : data.rows.map((r) => (
                  <tr key={r.journalLineId} style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
                    <td style={TD}>{new Date(r.entryDate).toLocaleDateString()}</td>
                    <td style={TD}>{r.description}</td>
                    <td style={{ ...TD, color: colors.textSecondary, fontSize: fontSize.sm }}>{r.sourceType}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{Number(r.debit) > 0 ? formatMoney(r.debit) : ''}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{Number(r.credit) > 0 ? formatMoney(r.credit) : ''}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{formatMoney(r.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${colors.border}`, background: colors.bg }}>
                  <td colSpan={5} style={{ ...TD, textAlign: 'right', fontWeight: fontWeight.bold }}>Closing Balance</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right' }}>{formatMoney(data.closingBalance)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </PortalPage>
    </div>
  )
}

export default function GeneralLedgerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>}>
      <GeneralLedgerInner />
    </Suspense>
  )
}
