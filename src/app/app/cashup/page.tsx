'use client'

import { useState } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Clock, Loader2, Lock, RefreshCw, ExternalLink } from 'lucide-react'
import { DENOMINATIONS, DENOMINATION_LABELS, type Denomination } from '@/lib/schemas/cashup'
import { PageShell } from '@/components/layout/PageShell'
import { colors } from '@/lib/design-tokens'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type CashUp = {
  id: string
  sessionDate: string
  status: 'open' | 'submitted' | 'approved'
  openedByUserId: string
  openedAt: string
  closedByUserId?: string
  closedAt?: string
  approvedByUserId?: string
  approvedAt?: string
  openingBalance:      string
  systemCashSales:     string
  systemCashPurchases: string
  systemCashPayments:  string
  systemCashExpected:  string
  expensesTotal:       string
  cardPaymentsTotal:   string
  drawingsReceived:    string
  loansTotal:          string
  declaredCash?:       string
  variance?:           string
  notes?:              string
  denominations?: Record<string, number>
}

type LiveStats = {
  cashSales:     string
  cashPurchases: string
  cashPayments:  string
  expenses:      string
  loanAdvance:   string
  loanRepayment: string
  unpaidToday:   { total: string; count: number }
  unpaidAllTime: { total: string; count: number }
  finPeriodCumulative: string
}

// ─── Denomination input row ───────────────────────────────────────────────────
function DenomRow({ denom, count, onChange, disabled }: {
  denom: Denomination; count: number; onChange: (v: number) => void; disabled: boolean
}) {
  const value = new Decimal(count).times(denom).div(100)
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-right font-mono text-sm font-semibold" style={{ color: colors.textPrimary }}>{DENOMINATION_LABELS[denom]}</span>
      <span className="text-xs" style={{ color: colors.textSecondary }}>×</span>
      <Input
        type="number" min={0}
        value={count === 0 ? '' : count}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className="w-20 text-right font-mono border-[#E0E0E0]"
        disabled={disabled} placeholder="0"
      />
      <span className="text-xs" style={{ color: colors.textSecondary }}>=</span>
      <span className="w-20 text-right font-mono text-sm" style={{ color: colors.textPrimary }}>R {value.toFixed(2)}</span>
    </div>
  )
}

// ─── Recon row ────────────────────────────────────────────────────────────────
function ReconRow({ label, value, positive, negative, highlight, muted, subtotal }: {
  label: string; value: string | undefined
  positive?: boolean; negative?: boolean; highlight?: boolean; muted?: boolean; subtotal?: boolean
}) {
  const n = new Decimal(value ?? '0')
  const labelColor = muted ? colors.textSecondary : colors.textSecondary
  const valueColor = positive ? colors.action : negative ? colors.danger : muted ? colors.textSecondary : colors.textPrimary
  return (
    <div className={`flex justify-between ${highlight || subtotal ? 'font-semibold' : ''} ${subtotal ? 'py-1.5 px-2 rounded' : ''}`}
      style={subtotal ? { background: colors.toolbar } : undefined}>
      <span style={{ color: labelColor }}>{label}</span>
      <span className="font-mono" style={{ color: valueColor }}>
        {negative && !n.isZero() ? '−' : positive && !n.isZero() ? '+' : ''}R {n.abs().toFixed(2)}
      </span>
    </div>
  )
}

function VarianceRow({ variance }: { variance: string }) {
  const v = new Decimal(variance)
  const pos = v.gte(0)
  const style = v.isZero()
    ? { background: colors.actionBg, color: colors.action }
    : pos ? { background: colors.processBg, color: colors.process }
           : { background: colors.dangerBg, color: colors.danger }
  return (
    <div className="flex justify-between font-semibold rounded px-2 py-1.5 mt-1" style={style}>
      <span>Balance (Variance)</span>
      <span className="font-mono">{pos && !v.isZero() ? '+' : ''}R {v.toFixed(2)}</span>
    </div>
  )
}

// ─── Unpaid cash card ─────────────────────────────────────────────────────────
function UnpaidCard({ label, total, count, href }: {
  label: string; total: string; count: number; href: string
}) {
  const router = useRouter()
  return (
    <div className="rounded-lg border p-4 bg-white flex flex-col gap-2" style={{ borderColor: colors.border }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{label}</p>
      <p className="font-mono font-bold text-lg" style={{ color: colors.danger }}>R {new Decimal(total).toFixed(2)}</p>
      <p className="text-xs" style={{ color: colors.textSecondary }}>{count} purchase{count !== 1 ? 's' : ''}</p>
      <button
        onClick={() => router.push(href)}
        className="flex items-center gap-1 text-xs font-medium mt-1"
        style={{ color: colors.process }}
      >
        <ExternalLink className="w-3 h-3" /> Report
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CashUpPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const { mutate: offlineMutate } = useOfflineMutation()

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const CASHUP_KEY   = '/api/cashup?today=1'
  const STATS_KEY    = `/api/cashup/live-stats?date=${today}`

  const { data,      isLoading }      = useSWR<{ cashUp: CashUp | null }>(CASHUP_KEY, fetcher)
  const { data: statsData, mutate: refreshStats } = useSWR<LiveStats>(STATS_KEY, fetcher)

  const cashUp = data?.cashUp ?? null
  const stats  = statsData

  const [opening,    setOpening]    = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [notes,      setNotes]      = useState('')
  const [drawings,   setDrawings]   = useState('0')
  const [counts, setCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]))
  )

  const declaredCash = DENOMINATIONS.reduce((acc, d) =>
    acc.plus(new Decimal(counts[d] ?? 0).times(d).div(100)), new Decimal(0)
  )

  async function handleOpen() {
    setOpening(true)
    try {
      const { queued } = await offlineMutate({
        method: 'POST',
        url: '/api/cashup',
        body: { sessionDate: today },
        localId: `local_cashup_${today}`,
      })
      if (queued) {
        toast.success('Cash-up session queued — will open when connected')
      } else {
        toast.success('Cash-up session opened')
        swrMutate(CASHUP_KEY)
      }
    } catch {
      toast.error('Failed to open session')
    } finally {
      setOpening(false)
    }
  }

  async function handleSubmit() {
    if (!cashUp) return
    setSubmitting(true)
    const denoms: Record<string, number> = {}
    for (const d of DENOMINATIONS) { const c = counts[d] ?? 0; if (c > 0) denoms[String(d)] = c }
    try {
      const { queued } = await offlineMutate({
        method: 'PUT',
        url: `/api/cashup/${cashUp.id}`,
        body: {
          denominations:    denoms,
          declaredCash:     declaredCash.toNumber(),
          drawingsReceived: new Decimal(drawings || '0').toNumber(),
          notes:            notes || undefined,
        },
        localId: cashUp.id,
      })
      if (queued) {
        toast.success('Cash-up saved offline — will submit when connected')
      } else {
        toast.success('Cash-up submitted for approval')
        swrMutate(CASHUP_KEY)
      }
    } catch {
      toast.error('Failed to submit cash-up')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove() {
    if (!cashUp) return
    setApproving(true)
    const res = await fetch(`/api/cashup/${cashUp.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setApproving(false)
    if (res.ok) { toast.success('Cash-up approved'); swrMutate(CASHUP_KEY); refreshStats() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to approve cash-up') }
  }

  if (isLoading) {
    return (
      <PageShell title="Cash-Up" subtitle="Daily reconciliation">
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: colors.textSecondary }}>
          Loading…
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell title="Cash-Up" subtitle={`${today} · Daily cash reconciliation`}>
      <div className="max-w-5xl mx-auto w-full space-y-5 pb-6">

        {/* No session */}
        {!cashUp && (
          <div className="rounded-lg border p-8 text-center bg-white" style={{ borderColor: colors.border }}>
            <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: colors.border }} />
            <p className="font-medium mb-1" style={{ color: colors.textPrimary }}>No session open for today</p>
            <p className="text-sm mb-5" style={{ color: colors.textSecondary }}>Open a session to begin tracking today&apos;s cash.</p>
            <button
              onClick={handleOpen} disabled={opening}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium text-white mx-auto disabled:opacity-50"
              style={{ background: colors.action }}
            >
              {opening ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Opening…</> : 'Open Session'}
            </button>
          </div>
        )}

        {cashUp && (
          <>
            {/* Status banner */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {cashUp.status === 'open'      && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.warningBg, color: colors.warning }}>Open</span>}
                {cashUp.status === 'submitted' && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.processBg, color: colors.process }}>Submitted — Awaiting Approval</span>}
                {cashUp.status === 'approved'  && <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.actionBg, color: colors.action }}><CheckCircle2 className="w-3 h-3" />Approved</span>}
                {cashUp.approvedAt && <span className="text-xs" style={{ color: colors.textMuted }}>{new Date(cashUp.approvedAt).toLocaleString('en-ZA')}</span>}
              </div>
              {cashUp.status === 'open' && (
                <button
                  onClick={() => refreshStats()}
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: colors.textSecondary }}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              )}
            </div>

            {/* Main content: reconciliation (left) + unpaid panels (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* ── Left: full reconciliation ───────────────────────────────── */}
              <div className="lg:col-span-2 rounded-lg border p-5 bg-white space-y-2 text-sm" style={{ borderColor: colors.border }}>
                <h2 className="font-semibold mb-3" style={{ color: colors.textPrimary }}>
                  {cashUp.status === 'open' ? 'Reconciliation (Live)' : 'Reconciliation'}
                </h2>

                {/* Use live stats when open, stored values when submitted/approved */}
                {(() => {
                  const isOpen       = cashUp.status === 'open'
                  const opening      = new Decimal(cashUp.openingBalance ?? '0')
                  const draw         = new Decimal(isOpen ? (drawings || '0') : (cashUp.drawingsReceived ?? '0'))
                  const totalCash    = opening.plus(draw)
                  const cashSales    = new Decimal(isOpen ? (stats?.cashSales    ?? '0') : cashUp.systemCashSales)
                  const cashPurch    = new Decimal(isOpen ? (stats?.cashPurchases ?? '0') : cashUp.systemCashPurchases)
                  const cashPay      = new Decimal(isOpen ? (stats?.cashPayments  ?? '0') : cashUp.systemCashPayments)
                  const expenses     = new Decimal(isOpen ? (stats?.expenses      ?? '0') : (cashUp.expensesTotal ?? '0'))
                  const loanAdv      = new Decimal(stats?.loanAdvance   ?? '0')
                  const loanRep      = new Decimal(stats?.loanRepayment ?? '0')
                  const calFloat     = totalCash.plus(cashSales).minus(cashPurch).minus(cashPay).minus(expenses).minus(loanAdv).plus(loanRep)
                  const declared     = isOpen ? declaredCash : new Decimal(cashUp.declaredCash ?? '0')
                  const balance      = declared.minus(calFloat)
                  const finCum       = new Decimal(stats?.finPeriodCumulative ?? '0')

                  return (
                    <>
                      {/* Opening + Drawings → Total Cash */}
                      <ReconRow label="Opening Balance" value={opening.toFixed(2)} positive />
                      {isOpen ? (
                        <div className="flex items-center justify-between">
                          <span style={{ color: colors.textSecondary }}>Drawings Received (+)</span>
                          <Input
                            type="number" min="0" step="0.01"
                            value={drawings}
                            onChange={(e) => setDrawings(e.target.value)}
                            className="w-28 text-right font-mono h-7 text-sm"
                            disabled={submitting}
                          />
                        </div>
                      ) : (
                        <ReconRow label="Drawings Received (+)" value={draw.toFixed(2)} positive />
                      )}
                      <ReconRow label="Total Cash" value={totalCash.toFixed(2)} subtotal />

                      {/* Transactions */}
                      <div className="pt-1 space-y-1.5 border-t" style={{ borderColor: colors.border }}>
                        <ReconRow label="Cash Received / Sales (+)" value={cashSales.toFixed(2)} positive />
                        <ReconRow label="Cash Purchases (−)"        value={cashPurch.toFixed(2)} negative />
                        <ReconRow label="Account Payments (−)"      value={cashPay.toFixed(2)}   negative />
                        <ReconRow label="Expenses (−)"              value={expenses.toFixed(2)}  negative />
                        <ReconRow label="Loan Advance (−)"          value={loanAdv.toFixed(2)}   negative />
                        <ReconRow label="Loans Repayment (+)"       value={loanRep.toFixed(2)}   positive />
                      </div>

                      {/* Cal Float */}
                      <ReconRow label="Cal Float (Expected in Drawer)" value={calFloat.toFixed(2)} subtotal />

                      {/* Denomination count (open state only) */}
                      {isOpen && (
                        <div className="pt-3 border-t space-y-2" style={{ borderColor: colors.border }}>
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Count Your Cash</p>
                          {DENOMINATIONS.map((d) => (
                            <DenomRow
                              key={d} denom={d}
                              count={counts[d] ?? 0}
                              onChange={(v) => setCounts((prev) => ({ ...prev, [d]: v }))}
                              disabled={submitting}
                            />
                          ))}
                        </div>
                      )}

                      {/* Submitted denomination breakdown */}
                      {cashUp.status !== 'open' && cashUp.denominations && Object.keys(cashUp.denominations).length > 0 && (
                        <div className="pt-3 border-t space-y-1" style={{ borderColor: colors.border }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: colors.textSecondary }}>Denomination Breakdown</p>
                          {DENOMINATIONS.map((d) => {
                            const c = cashUp.denominations![String(d)] ?? 0
                            if (c === 0) return null
                            const val = new Decimal(c).times(d).div(100)
                            return (
                              <div key={d} className="flex items-center gap-3 text-sm">
                                <span className="w-14 text-right font-mono font-semibold" style={{ color: colors.textPrimary }}>{DENOMINATION_LABELS[d]}</span>
                                <span style={{ color: colors.textSecondary }}>×</span>
                                <span className="w-8 text-right font-mono" style={{ color: colors.textPrimary }}>{c}</span>
                                <span style={{ color: colors.textSecondary }}>=</span>
                                <span className="font-mono" style={{ color: colors.textPrimary }}>R {val.toFixed(2)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Cash On Hand + Balance */}
                      <div className="pt-2 border-t space-y-1" style={{ borderColor: colors.border }}>
                        <ReconRow label="Cash On Hand (Counted)" value={declared.toFixed(2)} highlight />
                        <VarianceRow variance={balance.toFixed(2)} />
                      </div>

                      {/* Fin Period Cumulative */}
                      <div className="pt-2 border-t flex justify-between text-sm font-medium" style={{ borderColor: colors.border }}>
                        <span style={{ color: colors.textSecondary }}>Fin Period Cumulative Balance</span>
                        <span className="font-mono" style={{ color: finCum.isZero() ? colors.textSecondary : finCum.gte(0) ? colors.process : colors.danger }}>
                          {finCum.gte(0) && !finCum.isZero() ? '+' : ''}R {finCum.toFixed(2)}
                        </span>
                      </div>

                      {/* Notes + submit (open state) */}
                      {isOpen && (
                        <div className="pt-3 border-t space-y-3" style={{ borderColor: colors.border }}>
                          <div>
                            <Label className="text-xs">Notes (optional)</Label>
                            <Textarea
                              value={notes}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                              placeholder="Any comments about the count..."
                              className="mt-1" rows={2} disabled={submitting}
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button onClick={handleSubmit} disabled={submitting}>
                              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : 'Submit Cash-Up'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Notes display (submitted/approved) */}
                      {cashUp.status !== 'open' && cashUp.notes && (
                        <p className="pt-2 border-t text-sm italic" style={{ borderColor: colors.border, color: colors.textSecondary }}>
                          &quot;{cashUp.notes}&quot;
                        </p>
                      )}

                      {/* Approve button */}
                      {cashUp.status === 'submitted' && (
                        <div className="pt-3 border-t flex justify-end" style={{ borderColor: colors.border }}>
                          {isManager ? (
                            <Button onClick={handleApprove} disabled={approving}>
                              {approving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</> : <><Lock className="w-4 h-4 mr-2" />Approve Cash-Up</>}
                            </Button>
                          ) : (
                            <p className="text-sm" style={{ color: colors.textSecondary }}>Awaiting manager approval</p>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* ── Right: unpaid panels ────────────────────────────────────── */}
              <div className="space-y-4">
                <UnpaidCard
                  label="Total Unpaid Cash"
                  total={stats?.unpaidAllTime.total ?? '0'}
                  count={stats?.unpaidAllTime.count ?? 0}
                  href="/app/purchases/unpaid"
                />
                <UnpaidCard
                  label="Today Unpaid Cash"
                  total={stats?.unpaidToday.total ?? '0'}
                  count={stats?.unpaidToday.count ?? 0}
                  href="/app/purchases/unpaid"
                />

                {/* Card / EFT sales info */}
                {new Decimal(cashUp.cardPaymentsTotal ?? '0').gt(0) && (
                  <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: colors.textSecondary }}>Card / EFT Sales</p>
                    <p className="font-mono font-bold" style={{ color: colors.process }}>R {new Decimal(cashUp.cardPaymentsTotal).toFixed(2)}</p>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Excluded from cash reconciliation</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
