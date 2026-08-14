'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { formatMoney } from './_lib/money'
import type { AccountTreeNode } from '@/lib/services/ledgerReportService'
import type { ProfitAndLossReport } from '@/lib/services/ledgerReportService'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}
function monthStartLabel(): string {
  return todayLabel().slice(0, 8) + '01'
}

function findByCode(nodes: AccountTreeNode[], code: string): AccountTreeNode | undefined {
  for (const n of nodes) {
    if (n.code === code) return n
    const found = findByCode(n.children, code)
    if (found) return found
  }
  return undefined
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'action' | 'danger' }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '14px 16px' }}>
      <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: fontWeight.bold, color: tone === 'danger' ? colors.danger : tone === 'action' ? colors.action : colors.textPrimary, marginTop: 4, fontFamily: 'monospace' }}>
        {value}
      </div>
    </div>
  )
}

export default function LedgerDashboardPage() {
  const { data: accountsData, isLoading: accountsLoading } = useSWR<{ asOf: string; accounts: AccountTreeNode[] }>('/api/ledger/accounts', fetcher)
  const from = monthStartLabel()
  const to = todayLabel()
  const { data: pl, isLoading: plLoading } = useSWR<ProfitAndLossReport>(`/api/ledger/profit-loss?from=${from}&to=${to}`, fetcher)

  const accounts = accountsData?.accounts ?? []
  const cash = findByCode(accounts, '1000')
  const bank = findByCode(accounts, '1010')
  const ar = findByCode(accounts, '1150')
  const inventory = findByCode(accounts, '1200')
  const ap = findByCode(accounts, '2000')
  const loading = accountsLoading || plLoading

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Ledger Dashboard</h1>
        <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>
          A real-time snapshot of the business&apos;s books, derived entirely from posted journal entries.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Cash on Hand" value={formatMoney(cash?.totalBalance ?? '0')} tone="action" />
            <StatCard label="Bank" value={formatMoney(bank?.totalBalance ?? '0')} tone="action" />
            <StatCard label="Accounts Receivable" value={formatMoney(ar?.totalBalance ?? '0')} />
            <StatCard label="Inventory" value={formatMoney(inventory?.totalBalance ?? '0')} />
            <StatCard label="Accounts Payable" value={formatMoney(ap?.totalBalance ?? '0')} tone="danger" />
          </div>

          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: 20 }}>
            <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.mainInstruction, marginBottom: 12 }}>
              This Month ({from} – {to})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Revenue" value={formatMoney(pl?.totalRevenue ?? '0')} tone="action" />
              <StatCard label="Cost of Goods Sold" value={formatMoney(pl?.totalCogs ?? '0')} />
              <StatCard label="Gross Profit" value={formatMoney(pl?.grossProfit ?? '0')} tone="action" />
              <StatCard label="Net Profit" value={formatMoney(pl?.netProfit ?? '0')} tone={pl && Number(pl.netProfit) < 0 ? 'danger' : 'action'} />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { href: '/ledger/accounts', label: 'Chart of Accounts', desc: 'Every account and its balance' },
          { href: '/ledger/general-ledger', label: 'General Ledger', desc: "One account's full activity" },
          { href: '/ledger/trial-balance', label: 'Trial Balance', desc: 'Debits vs credits self-check' },
          { href: '/ledger/profit-loss', label: 'Profit & Loss', desc: 'Revenue, COGS, expenses' },
          { href: '/ledger/balance-sheet', label: 'Balance Sheet', desc: 'Assets = Liabilities + Equity' },
          { href: '/ledger/journal', label: 'Journal', desc: 'Raw chronological entry feed' },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '14px 16px', textDecoration: 'none' }}
            className="hover:shadow-sm transition-shadow"
          >
            <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.link }}>{l.label}</div>
            <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
