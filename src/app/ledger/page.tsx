'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { TH, TD, Btn } from '@/components/rpx'
import { formatMoney } from './_lib/money'
import type {
  AccountTreeNode, PendingSalePaymentRow, EftAwaitingConfirmationRow,
  ProfitAndLossReport, ProfitByCategoryReport, StockValueByCategoryReport,
} from '@/lib/services/ledgerReportService'
import { CategoryPieChart } from './_components/CategoryPieChart'
import { CategoryProfitChart } from './_components/CategoryProfitChart'
import { StatCard } from './_components/StatCard'

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

// ─── Trading Breakdown ──────────────────────────────────────────────────────
// A simple trading-account view: what's actually available right now (cash
// in the drawer plus this period's gross profit from stock sold) before
// operating expenses come off it, and what's left after they do.

function TradingBreakdownCard({
  cashOnHand, stockProfit, availableBeforeExpenses, totalExpenses, netAfterExpenses,
}: {
  cashOnHand: Decimal
  stockProfit: Decimal
  availableBeforeExpenses: Decimal
  totalExpenses: Decimal
  netAfterExpenses: Decimal
}) {
  const row = (label: string, value: Decimal, opts?: { subtotal?: boolean; tone?: 'action' | 'danger' }) => (
    <div
      key={label}
      style={{
        display: 'flex', justifyContent: 'space-between', padding: '8px 0',
        borderTop: opts?.subtotal ? `2px solid ${colors.border}` : `1px solid ${colors.rowDivider}`,
        fontWeight: opts?.subtotal ? fontWeight.bold : fontWeight.regular,
      }}
    >
      <span style={{ color: colors.textPrimary, fontSize: fontSize.base }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: fontSize.base,
        color: opts?.tone === 'danger' ? colors.danger : opts?.tone === 'action' ? colors.action : colors.textPrimary,
      }}>
        {value.isNegative() ? '−' : ''}{formatMoney(value.abs().toFixed(2))}
      </span>
    </div>
  )

  return (
    <Panel title="Trading Breakdown" subtitle="Cash on hand plus this period's stock profit, before and after operating expenses.">
      <div style={{ padding: '4px 16px 16px' }}>
        {row('Cash on Hand', cashOnHand, { tone: 'action' })}
        {row("Stock Profit (this period's gross profit)", stockProfit, { tone: stockProfit.isNegative() ? 'danger' : 'action' })}
        {row('Available Before Expenses', availableBeforeExpenses, { subtotal: true })}
        {row('Total Expenses', totalExpenses.negated(), { tone: 'danger' })}
        {row('Net After Expenses', netAfterExpenses, { subtotal: true, tone: netAfterExpenses.isNegative() ? 'danger' : 'action' })}
      </div>
    </Panel>
  )
}

// ─── Cash Reconciliation ────────────────────────────────────────────────────
// Compares the Cashup module's operational cash figure against what the
// ledger itself has posted to the Cash account. They're two independent
// calculations that should agree in principle but can drift (unposted float
// top-ups, timing differences, an unrecorded till discrepancy) — this is a
// read-only diagnostic, not a correction; nothing here posts anything.

const RECONCILIATION_TOLERANCE = '0.01'

function CashReconciliationCard({ cashUpCash, ledgerCash, ledgerBank, variance }: {
  cashUpCash: Decimal
  ledgerCash: Decimal
  ledgerBank: Decimal
  variance: Decimal
}) {
  const balanced = variance.abs().lessThanOrEqualTo(RECONCILIATION_TOLERANCE)

  const row = (label: string, value: Decimal, opts?: { subtotal?: boolean; tone?: 'action' | 'danger' }) => (
    <div
      key={label}
      style={{
        display: 'flex', justifyContent: 'space-between', padding: '8px 0',
        borderTop: opts?.subtotal ? `2px solid ${colors.border}` : `1px solid ${colors.rowDivider}`,
        fontWeight: opts?.subtotal ? fontWeight.bold : fontWeight.regular,
      }}
    >
      <span style={{ color: colors.textPrimary, fontSize: fontSize.base }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: fontSize.base,
        color: opts?.tone === 'danger' ? colors.danger : opts?.tone === 'action' ? colors.action : colors.textPrimary,
      }}>
        {value.isNegative() ? '−' : ''}{formatMoney(value.abs().toFixed(2))}
      </span>
    </div>
  )

  return (
    <Panel title="Cash Reconciliation" subtitle="Cashup's operational cash figure vs. what's actually posted to the ledger's Cash account.">
      <div style={{ padding: '4px 16px 16px' }}>
        {row('Cash-up (operational)', cashUpCash)}
        {row('Ledger (posted, account 1000)', ledgerCash)}
        {row('Ledger Bank (posted, account 1010)', ledgerBank)}
        {row('Variance', variance, { subtotal: true, tone: balanced ? 'action' : 'danger' })}
        {!balanced && (
          <div style={{ marginTop: 8, fontSize: fontSize.sm, color: colors.danger }}>
            Cash-up and the posted ledger disagree by more than {formatMoney(RECONCILIATION_TOLERANCE)}.
          </div>
        )}
      </div>
    </Panel>
  )
}

// ─── Profit by Category ─────────────────────────────────────────────────────

function ProfitByCategoryCard({ report, loading, from, to }: { report?: ProfitByCategoryReport; loading: boolean; from: string; to: string }) {
  return (
    <Panel title="Profit by Category" subtitle={`Realized revenue minus cost of goods sold, per category (${from} – ${to}).`}>
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
        ) : !report || report.rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>No category activity in this period yet.</div>
        ) : (
          <>
            <CategoryProfitChart data={report.rows.map((r) => ({ label: r.category, value: Number(r.profit) }))} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: `2px solid ${colors.border}` }}>
              <span style={{ fontWeight: fontWeight.semibold, color: colors.textPrimary }}>Overall Profit</span>
              <span style={{
                fontFamily: 'monospace', fontWeight: fontWeight.bold,
                color: Number(report.totalProfit) < 0 ? colors.danger : colors.action,
              }}>
                {formatMoney(report.totalProfit)}
              </span>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

// ─── Stock Value by Category ────────────────────────────────────────────────

function StockByCategoryCard({ report, loading }: { report?: StockValueByCategoryReport; loading: boolean }) {
  return (
    <Panel title="Stock Value by Category" subtitle="Current stock on hand, valued at cost (average purchase cost).">
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
        ) : !report || report.rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>No stock on hand.</div>
        ) : (
          <CategoryPieChart
            title="Stock value by category"
            data={report.rows.map((r) => ({ label: r.category, value: Number(r.costValue) }))}
          />
        )}
      </div>
    </Panel>
  )
}

/** Detail table backing the pie chart above — kg on hand, cost basis, current sale value, and the profit still sitting in that stock if sold at list price. */
function StockByCategoryTable({ report, loading }: { report?: StockValueByCategoryReport; loading: boolean }) {
  return (
    <Panel title="Stock on Hand — Detail" subtitle="Per category: quantity, what it cost, what it's worth at current sale prices, and the profit margin still in it.">
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
      ) : !report || report.rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary }}>No stock on hand.</div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th style={TH}>Category</th>
                <th style={{ ...TH, textAlign: 'right' }}>Stock (kg)</th>
                <th style={{ ...TH, textAlign: 'right' }}>Cost Value</th>
                <th style={{ ...TH, textAlign: 'right' }}>Sale Value</th>
                <th style={{ ...TH, textAlign: 'right' }}>Potential Profit</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.category} style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
                  <td style={TD}>{r.category}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>
                    {Number(r.totalKg).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {r.otherQty && <span style={{ color: colors.textSecondary, fontSize: fontSize.xs }}> + {r.otherQty}</span>}
                  </td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{formatMoney(r.costValue)}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{formatMoney(r.saleValue)}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', fontWeight: fontWeight.semibold, color: Number(r.potentialProfit) < 0 ? colors.danger : colors.action }}>
                    {formatMoney(r.potentialProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${colors.border}`, background: colors.bg }}>
                <td style={{ ...TD, fontWeight: fontWeight.semibold }}>Total</td>
                <td />
                <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right' }}>{formatMoney(report.totalCostValue)}</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right' }}>{formatMoney(report.totalSaleValue)}</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, textAlign: 'right', color: Number(report.totalPotentialProfit) < 0 ? colors.danger : colors.action }}>
                  {formatMoney(report.totalPotentialProfit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
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
  const { data: cashOnHandData, isLoading: cashLoading } = useSWR<{ date: string; cashOnHand: string; ledgerCash: string; ledgerBank: string; variance: string }>('/api/ledger/cash-on-hand', fetcher)
  const { data: profitByCategory, isLoading: pbcLoading } = useSWR<ProfitByCategoryReport>(`/api/ledger/profit-by-category?from=${from}&to=${to}`, fetcher)
  const { data: stockByCategory, isLoading: sbcLoading } = useSWR<StockValueByCategoryReport>('/api/ledger/stock-by-category', fetcher)

  const accounts = accountsData?.accounts ?? []
  const bank = findByCode(accounts, '1010')
  const ar = findByCode(accounts, '1150')
  const inventory = findByCode(accounts, '1200')
  const ap = findByCode(accounts, '2000')
  const loading = accountsLoading || plLoading || cashLoading

  const cashOnHand    = new Decimal(cashOnHandData?.cashOnHand ?? '0')
  const stockProfit   = new Decimal(pl?.grossProfit ?? '0')
  const totalExpenses = new Decimal(pl?.totalOperatingExpenses ?? '0')
  const availableBeforeExpenses = cashOnHand.plus(stockProfit)
  const netAfterExpenses        = availableBeforeExpenses.minus(totalExpenses)

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

          <TradingBreakdownCard
            cashOnHand={cashOnHand}
            stockProfit={stockProfit}
            availableBeforeExpenses={availableBeforeExpenses}
            totalExpenses={totalExpenses}
            netAfterExpenses={netAfterExpenses}
          />

          <CashReconciliationCard
            cashUpCash={cashOnHand}
            ledgerCash={new Decimal(cashOnHandData?.ledgerCash ?? '0')}
            ledgerBank={new Decimal(cashOnHandData?.ledgerBank ?? '0')}
            variance={new Decimal(cashOnHandData?.variance ?? '0')}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ProfitByCategoryCard report={profitByCategory} loading={pbcLoading} from={from} to={to} />
            <StockByCategoryCard report={stockByCategory} loading={sbcLoading} />
          </div>

          <StockByCategoryTable report={stockByCategory} loading={sbcLoading} />
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
          { href: '/ledger/journal/new', label: 'New Journal Entry', desc: 'Post a manual/adjusting entry' },
          { href: '/ledger/opening-balance', label: 'Opening Balances', desc: 'One-time starting figures for a new ledger' },
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
