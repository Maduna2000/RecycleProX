'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PortalPage, TH, TD, Btn } from '@/components/rpx'
import { ChevronRight, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { formatMoney } from '../_lib/money'
import { StatCard } from '../_components/StatCard'
import type { AccountTreeNode } from '@/lib/services/ledgerReportService'

function AccountRow({ node, depth, defaultOpen }: { node: AccountTreeNode; depth: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = node.children.length > 0
  const balance = Number(node.totalBalance)

  return (
    <>
      <tr style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
        <td style={{ ...TD, paddingLeft: 10 + depth * 20 }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button onClick={() => setOpen(!open)} className="flex items-center justify-center" style={{ width: 16, height: 16, color: colors.textSecondary }}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span style={{ width: 16 }} />
            )}
            <Link href={`/ledger/general-ledger?accountId=${node.id}`} style={{ color: colors.link, textDecoration: 'none', fontWeight: depth === 0 ? fontWeight.semibold : fontWeight.regular }}>
              {node.name}
            </Link>
          </div>
        </td>
        <td style={{ ...TD, fontFamily: 'monospace', color: colors.textSecondary }}>{node.code}</td>
        <td style={{ ...TD, textTransform: 'capitalize', color: colors.textSecondary }}>{node.type}</td>
        <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', fontWeight: depth === 0 ? fontWeight.semibold : fontWeight.regular, color: balance < 0 ? colors.danger : colors.textPrimary }}>
          {formatMoney(node.totalBalance)}
        </td>
      </tr>
      {open && node.children.map((c) => <AccountRow key={c.id} node={c} depth={depth + 1} defaultOpen={defaultOpen} />)}
    </>
  )
}

/** Sums every top-level account's totalBalance by type — a quick "how big is each side of the books" overview above the full tree. */
function sumByType(accounts: AccountTreeNode[], type: AccountTreeNode['type']): number {
  return accounts.filter((a) => a.type === type).reduce((sum, a) => sum + Number(a.totalBalance), 0)
}

export default function ChartOfAccountsPage() {
  const { data, isLoading } = useSWR<{ asOf: string; accounts: AccountTreeNode[] }>('/api/ledger/accounts', fetcher)
  const [defaultOpen, setDefaultOpen] = useState(true)
  const [treeKey, setTreeKey] = useState(0)

  function toggleAll() {
    setDefaultOpen((v) => !v)
    setTreeKey((k) => k + 1) // remounts every AccountRow so its local open state re-reads the new default
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Chart of Accounts</h1>
          <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>
            Every account, rolled up from its category/expense-type children. Click an account to view its full activity.
          </p>
        </div>
        <Btn icon={ChevronsUpDown} onClick={toggleAll}>{defaultOpen ? 'Collapse All' : 'Expand All'}</Btn>
      </div>

      {data && data.accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Assets" value={formatMoney(sumByType(data.accounts, 'asset').toFixed(2))} tone="action" />
          <StatCard label="Liabilities" value={formatMoney(sumByType(data.accounts, 'liability').toFixed(2))} tone="danger" />
          <StatCard label="Equity" value={formatMoney(sumByType(data.accounts, 'equity').toFixed(2))} />
          <StatCard label="Revenue" value={formatMoney(sumByType(data.accounts, 'revenue').toFixed(2))} tone="action" />
          <StatCard label="Expenses" value={formatMoney(sumByType(data.accounts, 'expense').toFixed(2))} />
        </div>
      )}

      <PortalPage title="Chart of Accounts">
        <div style={{ overflow: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
          ) : !data || data.accounts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>
              No accounts yet — the structural chart of accounts is created the first time any transaction posts.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Account</th>
                  <th style={TH}>Code</th>
                  <th style={TH}>Type</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody key={treeKey}>
                {data.accounts.map((n) => <AccountRow key={n.id} node={n} depth={0} defaultOpen={defaultOpen} />)}
              </tbody>
            </table>
          )}
        </div>
      </PortalPage>
    </div>
  )
}
