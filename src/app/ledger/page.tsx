'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { toast } from 'sonner'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { TH, TD, Btn } from '@/components/rpx'
import { formatMoney } from './_lib/money'
import type { AccountTreeNode, PendingSalePaymentRow, EftAwaitingConfirmationRow } from '@/lib/services/ledgerReportService'
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

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>{title}</div>
        <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  )
}

// ─── Pending Payments (unpaid Sales) ───────────────────────────────────────

function PendingPaymentsSection() {
  const { data, isLoading } = useSWR<{ rows: PendingSalePaymentRow[]; total: string }>('/api/ledger/pending-payments', fetcher)

  return (
    <Panel title="Pending Payments" subtitle="Unpaid sales — money expected but not yet received, from any method.">
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>No unpaid sales.</div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th style={TH}>Sale</th>
                <th style={TH}>Buyer</th>
                <th style={TH}>Date</th>
                <th style={{ ...TH, textAlign: 'right' }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.saleId} style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
                  <td style={TD}>{r.refNumber}</td>
                  <td style={TD}>{r.buyerName ?? '—'}</td>
                  <td style={TD}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', color: colors.warning, fontWeight: fontWeight.semibold }}>{formatMoney(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${colors.border}`, background: colors.bg }}>
                <td colSpan={3} style={{ ...TD, textAlign: 'right', fontWeight: fontWeight.semibold }}>Total expected</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right' }}>{formatMoney(data.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ─── Accounts Receivable — EFT Awaiting Confirmation ───────────────────────

function EftReceivablesSection() {
  const { data, isLoading, mutate } = useSWR<{ rows: EftAwaitingConfirmationRow[]; total: string }>('/api/ledger/eft-receivables', fetcher)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function handleConfirm(row: EftAwaitingConfirmationRow) {
    setConfirmingId(row.saleId)
    try {
      const res = await fetch('/api/ledger/eft-receivables/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: row.saleId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await mutate()
      toast.success(`Confirmed ${formatMoney(row.eftAmount)} received for ${row.refNumber}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm receipt')
    } finally {
      setConfirmingId(null)
    }
  }

  return (
    <Panel title="Accounts Receivable — EFT Awaiting Confirmation" subtitle="Completed EFT sales still sitting as receivable until you confirm the transfer actually landed in the bank.">
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>Nothing awaiting confirmation.</div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th style={TH}>Sale</th>
                <th style={TH}>Buyer</th>
                <th style={TH}>Date</th>
                <th style={{ ...TH, textAlign: 'right' }}>EFT Amount</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.saleId} style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
                  <td style={TD}>{r.refNumber}</td>
                  <td style={TD}>{r.buyerName ?? '—'}</td>
                  <td style={TD}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{formatMoney(r.eftAmount)}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    <Btn size="sm" variant="primary" loading={confirmingId === r.saleId} onClick={() => handleConfirm(r)}>
                      Confirm Received
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${colors.border}`, background: colors.bg }}>
                <td colSpan={3} style={{ ...TD, textAlign: 'right', fontWeight: fontWeight.semibold }}>Total awaiting confirmation</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right' }}>{formatMoney(data.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  )
}

export default function LedgerDashboardPage() {
  const { data: accountsData, isLoading: accountsLoading } = useSWR<{ asOf: string; accounts: AccountTreeNode[] }>('/api/ledger/accounts', fetcher)
  const from = monthStartLabel()
  const to = todayLabel()
  const { data: pl, isLoading: plLoading } = useSWR<ProfitAndLossReport>(`/api/ledger/profit-loss?from=${from}&to=${to}`, fetcher)
  // Cash on Hand is the Cashup module's real-time "cash in the drawer right
  // now" figure (Opening Balance + today's live movements), not the ledger's
  // own journal-posted Cash account balance — the two are different
  // calculations and the posted balance drifts from the operational one.
  const { data: cashOnHandData, isLoading: cashLoading } = useSWR<{ date: string; cashOnHand: string }>('/api/ledger/cash-on-hand', fetcher)

  const accounts = accountsData?.accounts ?? []
  const bank = findByCode(accounts, '1010')
  const ar = findByCode(accounts, '1150')
  const inventory = findByCode(accounts, '1200')
  const ap = findByCode(accounts, '2000')
  const loading = accountsLoading || plLoading || cashLoading

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
            <StatCard label="Cash on Hand" value={formatMoney(cashOnHandData?.cashOnHand ?? '0')} tone="action" />
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

      <PendingPaymentsSection />
      <EftReceivablesSection />

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
