'use client'

import React, { useState } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Calculator, Clock, Loader2, Lock, RefreshCw, ExternalLink, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DENOMINATIONS, DENOMINATION_LABELS } from '@/lib/schemas/cashup'
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
  cardSales:     string
  cashPurchases: string
  cashPayments:  string
  expenses:      string
  loanAdvance:   string
  loanRepayment: string
  floatTopUps:   string
  unpaidToday:   { total: string; count: number }
  unpaidAllTime: { total: string; count: number }
  finPeriodCumulative: string
}

type ExpenseItem = {
  id: string; refNumber: string; description: string
  amount: string; paymentMethod: string; status: string
  expenseType: { name: string }
}


// ─── Reconciliation row ───────────────────────────────────────────────────────
// positive = green. negative = neutral text with "−" prefix (NOT red — deductions are expected).
// Red is reserved only for the VarianceRow when cash is short.
function ReconRow({ label, value, positive, negative, highlight, muted, subtotal }: {
  label: string; value: string | undefined
  positive?: boolean; negative?: boolean; highlight?: boolean; muted?: boolean; subtotal?: boolean
}) {
  const n = new Decimal(value ?? '0')
  const valueColor = positive && !n.isZero() ? colors.action
                   : muted                    ? colors.textSecondary
                   : colors.textPrimary
  return (
    <div className={`flex justify-between text-sm ${highlight || subtotal ? 'font-semibold' : ''} ${subtotal ? 'py-1 px-2 rounded' : ''}`}
      style={subtotal ? { background: colors.toolbar } : undefined}>
      <span style={{ color: muted ? colors.textSecondary : colors.textSecondary }}>{label}</span>
      <span className="font-mono" style={{ color: valueColor }}>
        {negative && !n.isZero() ? '−' : ''}R {n.abs().toFixed(2)}
      </span>
    </div>
  )
}

// ─── Variance row — only shown after denominations entered ────────────────────
function VarianceRow({ variance }: { variance: string }) {
  const v = new Decimal(variance)
  const style = v.isZero()
    ? { background: colors.actionBg,  color: colors.action  }
    : v.gt(0)
    ? { background: colors.processBg, color: colors.process }
    : { background: colors.dangerBg,  color: colors.danger  }
  return (
    <div className="flex justify-between font-semibold rounded px-2 py-1.5 text-sm" style={style}>
      <span>Balance (Variance)</span>
      <span className="font-mono">{v.gt(0) ? '+' : ''}R {v.toFixed(2)}</span>
    </div>
  )
}

// ─── Count Cash modal ─────────────────────────────────────────────────────────
function CountCashModal({ counts, setCounts, notes, setNotes, submitting, handleSubmit, onClose }: {
  counts: Record<number, number>
  setCounts: React.Dispatch<React.SetStateAction<Record<number, number>>>
  notes: string
  setNotes: (v: string) => void
  submitting: boolean
  handleSubmit: () => Promise<void>
  onClose: () => void
}) {
  const total = DENOMINATIONS.reduce(
    (s, d) => s.plus(new Decimal(counts[d] ?? 0).times(d).div(100)),
    new Decimal(0)
  )
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        {/* Title bar with close button — matches ManageCategoriesModal pattern */}
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: colors.border }}>
          <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Count Cash</span>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
          </button>
        </div>
        <div className="space-y-3 mt-1">

          {/* Denomination table — bordered, scrollable, one row per denomination */}
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 3, overflow: 'hidden' }}>
            {/* Column headers */}
            <div
              className="grid px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ gridTemplateColumns: '1fr 6rem 6rem', background: colors.toolbar, color: colors.textSecondary }}
            >
              <span>Denomination</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Value</span>
            </div>

            {/* One full-width row per denomination */}
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {DENOMINATIONS.map((d) => {
                const val = new Decimal(counts[d] ?? 0).times(d).div(100)
                return (
                  <div
                    key={d}
                    className="grid items-center px-3 py-2"
                    style={{ gridTemplateColumns: '1fr 6rem 6rem', borderTop: `1px solid ${colors.border}` }}
                  >
                    <span className="font-mono font-semibold text-sm" style={{ color: colors.textPrimary }}>
                      {DENOMINATION_LABELS[d]}
                    </span>
                    <div className="flex justify-center">
                      <Input
                        type="number" min={0}
                        value={(counts[d] ?? 0) === 0 ? '' : counts[d]}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [d]: Math.max(0, parseInt(e.target.value || '0', 10)) }))}
                        className="w-16 text-center font-mono h-7 text-sm border-[#E0E0E0] px-1"
                        disabled={submitting} placeholder="0"
                      />
                    </div>
                    <span className="font-mono text-sm text-right" style={{ color: val.isZero() ? colors.textSecondary : colors.textPrimary }}>
                      R {val.toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Counted total */}
          <div
            className="flex justify-between items-center px-3 py-2 rounded text-sm font-semibold"
            style={{ background: colors.toolbar, border: `1px solid ${colors.border}` }}
          >
            <span style={{ color: colors.textSecondary }}>Counted Total</span>
            <span className="font-mono text-base" style={{ color: total.isZero() ? colors.textSecondary : colors.textPrimary }}>
              R {total.toFixed(2)}
            </span>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs" style={{ color: colors.textSecondary }}>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="Any comments about the count…"
              className="mt-1 text-sm" rows={2} disabled={submitting}
            />
          </div>

          <button
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              width: '100%',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            }}
            onClick={() => { void handleSubmit(); onClose() }}
            disabled={submitting}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = '#E0E0E0' }}
          >
            {submitting
              ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />Submitting…</>
              : 'Submit Cash-Up'
            }
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Compact unpaid card ──────────────────────────────────────────────────────
function UnpaidCard({ label, total, count, href }: {
  label: string; total: string; count: number; href: string
}) {
  const router = useRouter()
  return (
    <div className="rounded border bg-white overflow-hidden" style={{ borderColor: colors.border }}>
      <div className="flex items-center justify-between" style={{ padding: '6px 12px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)' }}>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{label}</span>
        <button onClick={() => router.push(href)} className="flex items-center gap-1 text-xs font-medium" style={{ color: colors.process }}>
          <ExternalLink className="w-3 h-3" /> Report
        </button>
      </div>
      <div className="p-3">
        <p className="font-mono font-bold text-base" style={{ color: colors.danger }}>R {new Decimal(total).toFixed(2)}</p>
        <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{count} purchase{count !== 1 ? 's' : ''}</p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CashUpPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const { mutate: offlineMutate } = useOfflineMutation()

  const todayISO = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const CASHUP_KEY = '/api/cashup?today=1'
  const { data, isLoading } = useSWR<{ cashUp: CashUp | null }>(CASHUP_KEY, fetcher)

  // Use the cashup session date for stats/expenses, not today's date
  // This ensures we get data for the actual cashup session (which may span past midnight)
  const sessionDate = data?.cashUp?.sessionDate?.split('T')[0] ?? todayISO

  const STATS_KEY    = `/api/cashup/live-stats?date=${sessionDate}`
  const EXPENSES_KEY = `/api/expenses?from=${sessionDate}&to=${sessionDate}&page=1`

  const { data: statsData, mutate: refreshStats }    = useSWR<LiveStats>(STATS_KEY, fetcher)
  const { data: expensesData, mutate: refreshExpenses } = useSWR<{ expenses: ExpenseItem[] }>(EXPENSES_KEY, fetcher)

  const cashUp   = data?.cashUp ?? null
  const stats    = statsData
  const expenses = expensesData?.expenses ?? []

  const [approvingExpense, setApprovingExpense] = useState<string | null>(null)

  async function handleApproveExpense(id: string) {
    setApprovingExpense(id)
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, { method: 'POST' })
      if (res.ok) { refreshExpenses(); refreshStats() }
      else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed to approve expense') }
    } finally { setApprovingExpense(null) }
  }

  const [opening,    setOpening]    = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [notes,      setNotes]      = useState('')
  const [counts, setCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]))
  )

  const [countCashOpen, setCountCashOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)

  // Fetch all open sessions to show count
  const { data: openSessionsData } = useSWR<{ sessions: CashUp[] }>('/api/cashup/open-sessions', fetcher)
  const openSessionsCount = openSessionsData?.sessions?.length ?? 0

  async function handleVoidSession() {
    if (!cashUp || !isManager) return
    const reason = window.prompt('Enter reason for voiding this session (e.g., "Unable to reconcile - data lost"):')
    if (!reason) return

    setVoiding(true)
    try {
      const res = await fetch(`/api/cashup/${cashUp.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        toast.success('Session voided')
        swrMutate(CASHUP_KEY)
        swrMutate('/api/cashup/open-sessions')
      } else {
        const j = await res.json()
        toast.error(j.error ?? 'Failed to void session')
      }
    } catch {
      toast.error('Failed to void session')
    } finally {
      setVoiding(false)
    }
  }

  const declaredCash = DENOMINATIONS.reduce(
    (acc, d) => acc.plus(new Decimal(counts[d] ?? 0).times(d).div(100)),
    new Decimal(0)
  )
  const hasCounted = !declaredCash.isZero()

  async function handleOpen() {
    setOpening(true)
    try {
      const { queued } = await offlineMutate({
        method: 'POST', url: '/api/cashup',
        body: { sessionDate: todayISO },
        localId: `local_cashup_${todayISO}`,
      })
      if (queued) toast.success('Cash-up session queued — will open when connected')
      else { toast.success('Cash-up session opened'); swrMutate(CASHUP_KEY) }
    } catch { toast.error('Failed to open session') }
    finally { setOpening(false) }
  }

  async function handleSubmit() {
    if (!cashUp) return
    setSubmitting(true)
    const denoms: Record<string, number> = {}
    for (const d of DENOMINATIONS) { const c = counts[d] ?? 0; if (c > 0) denoms[String(d)] = c }
    try {
      const { queued } = await offlineMutate({
        method: 'PUT', url: `/api/cashup/${cashUp.id}`,
        body: {
          denominations: denoms,
          declaredCash:  declaredCash.toNumber(),
          notes:         notes || undefined,
        },
        localId: cashUp.id,
      })
      if (queued) toast.success('Cash-up saved offline — will submit when connected')
      else { toast.success('Cash-up submitted for approval'); swrMutate(CASHUP_KEY) }
    } catch { toast.error('Failed to submit cash-up') }
    finally { setSubmitting(false) }
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

  // Check if viewing previous day's session
  const isPreviousDay = cashUp && cashUp.status === 'open' && sessionDate !== todayISO

  return (
    <PageShell title="Cash-Up" subtitle={isPreviousDay ? `${sessionDate} · ⚠ Previous day — submit to continue` : `${sessionDate} · Daily cash reconciliation`}>
      <div className="max-w-6xl mx-auto w-full space-y-4 pb-6">

        {/* No session */}
        {!cashUp && (
          <div className="rounded border bg-white overflow-hidden" style={{ borderColor: colors.border }}>
            <div style={{ padding: '6px 12px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)' }}>
              <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Today&apos;s Session</span>
            </div>
            <div className="p-8 text-center">
            <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: colors.border }} />
            <p className="font-medium mb-1" style={{ color: colors.textPrimary }}>No session open for today</p>
            <p className="text-sm mb-5" style={{ color: colors.textSecondary }}>Open a session to begin tracking today&apos;s cash.</p>
            <button
              onClick={handleOpen}
              disabled={opening}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: opening ? 'not-allowed' : 'pointer',
                opacity: opening ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                margin: '0 auto',
              }}
              onMouseEnter={(e) => { if (!opening) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!opening) e.currentTarget.style.background = '#E0E0E0' }}
            >
              {opening ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Opening…</> : 'Open Session'}
            </button>
            </div>
          </div>
        )}

        {cashUp && (
          <>
            {/* Previous day warning — must submit before starting new day */}
            {cashUp.status === 'open' && sessionDate !== todayISO && (
              <div className="rounded border overflow-hidden" style={{ borderColor: colors.danger, background: colors.dangerBg }}>
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm mb-1" style={{ color: colors.danger }}>
                        ⚠ Previous Day&apos;s Cash-Up Not Submitted
                        {openSessionsCount > 1 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-xs" style={{ background: colors.danger, color: '#fff' }}>
                            {openSessionsCount} open sessions
                          </span>
                        )}
                      </p>
                      <p className="text-sm" style={{ color: colors.textPrimary }}>
                        You have an open session from <strong>{sessionDate}</strong> that needs to be submitted before you can start today&apos;s session.
                        {openSessionsCount > 1
                          ? ' You have multiple old sessions — submit or void each one to proceed.'
                          : ' Please count your cash and submit the cash-up below.'}
                      </p>
                    </div>
                    {isManager && (
                      <button
                        onClick={handleVoidSession}
                        disabled={voiding}
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          background: colors.danger,
                          color: '#fff',
                          border: 'none',
                          borderRadius: 2,
                          cursor: voiding ? 'not-allowed' : 'pointer',
                          opacity: voiding ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {voiding ? 'Voiding...' : 'Void Session'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Zero-float warning */}
            {cashUp.status === 'open' && new Decimal(cashUp.openingBalance ?? '0').isZero() && (
              <div className="flex items-center gap-2 rounded px-3 py-2 text-sm" style={{ background: colors.warningBg, color: colors.warning }}>
                <span className="font-semibold">⚠ Opening balance is R 0.00.</span>
                <span>Set today&apos;s float in the</span>
                <a href="/app/float" className="underline font-medium">Float module</a>
                <span>before submitting.</span>
              </div>
            )}

            {/* Status + refresh row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {cashUp.status === 'open' && isPreviousDay && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.dangerBg, color: colors.danger }}>Previous Day — Submit Required</span>}
                {cashUp.status === 'open' && !isPreviousDay && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.warningBg, color: colors.warning }}>Open</span>}
                {cashUp.status === 'submitted' && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.processBg, color: colors.process }}>Submitted — Awaiting Approval</span>}
                {cashUp.status === 'approved'  && <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.actionBg, color: colors.action }}><CheckCircle2 className="w-3 h-3" />Approved</span>}
                {cashUp.approvedAt && <span className="text-xs" style={{ color: colors.textMuted }}>{new Date(cashUp.approvedAt).toLocaleString('en-ZA')}</span>}
              </div>
              {cashUp.status === 'open' && (
                <button onClick={() => refreshStats()} className="flex items-center gap-1 text-xs font-medium" style={{ color: colors.textSecondary }}>
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              )}
            </div>

            {/* ── 2-column layout: left = reconciliation, right = count + panels ── */}
            {(() => {
              const isOpen    = cashUp.status === 'open'
              const opening   = new Decimal(cashUp.openingBalance ?? '0')
              const draw      = new Decimal(isOpen ? (stats?.floatTopUps ?? '0') : (cashUp.drawingsReceived ?? '0'))
              const totalCash = opening.plus(draw)
              const cashSales = new Decimal(isOpen ? (stats?.cashSales    ?? '0') : cashUp.systemCashSales)
              const cashPurch = new Decimal(isOpen ? (stats?.cashPurchases ?? '0') : cashUp.systemCashPurchases)
              const cashPay   = new Decimal(isOpen ? (stats?.cashPayments  ?? '0') : cashUp.systemCashPayments)
              const exp       = new Decimal(isOpen ? (stats?.expenses      ?? '0') : (cashUp.expensesTotal ?? '0'))
              const loanAdv   = new Decimal(stats?.loanAdvance   ?? '0')
              const loanRep   = new Decimal(stats?.loanRepayment ?? '0')
              const calFloat  = totalCash.plus(cashSales).minus(cashPurch).minus(cashPay).minus(exp).minus(loanAdv).plus(loanRep)
              const declared  = isOpen ? declaredCash : new Decimal(cashUp.declaredCash ?? '0')
              const balance   = declared.minus(calFloat)
              const finCum    = new Decimal(stats?.finPeriodCumulative ?? '0')
              const cardSalesLive = new Decimal(stats?.cardSales ?? '0')

              return (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                  {/* ── LEFT: reconciliation numbers (always compact) ─────────── */}
                  <div className="lg:col-span-3 rounded border bg-white overflow-hidden" style={{ borderColor: colors.border }}>
                    <div style={{ padding: '6px 12px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)' }}>
                      <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>
                        {isOpen ? 'Reconciliation (Live)' : 'Reconciliation'}
                      </span>
                    </div>
                    <div className="p-4 space-y-1.5">

                    {/* Opening + Drawings */}
                    <ReconRow label="Opening Balance" value={opening.toFixed(2)} positive />
                    <ReconRow label="Drawings Received (+)" value={draw.toFixed(2)} positive />
                    <ReconRow label="Total Cash" value={totalCash.toFixed(2)} subtotal />

                    {/* Transaction rows */}
                    <div className="pt-1 space-y-1 border-t" style={{ borderColor: colors.border }}>
                      <ReconRow label="Cash Received / Sales (+)"   value={cashSales.toFixed(2)} positive />
                      {isOpen && cardSalesLive.gt(0) && (
                        <ReconRow label="Card / EFT Sales (not in drawer)" value={cardSalesLive.toFixed(2)} muted />
                      )}
                      <ReconRow label="Cash Purchases (−)"          value={cashPurch.toFixed(2)} negative />
                      <ReconRow label="Account Payments (−)"        value={cashPay.toFixed(2)}   negative />
                      <ReconRow label="Expenses (−)"                value={exp.toFixed(2)}       negative />
                      <ReconRow label="Loan Advance (−)"            value={loanAdv.toFixed(2)}   negative />
                      <ReconRow label="Loans Repayment (+)"         value={loanRep.toFixed(2)}   positive />
                    </div>

                    {/* Expected float */}
                    <ReconRow label="Cal Float (Expected in Drawer)" value={calFloat.toFixed(2)} subtotal />

                    {/* Cash counted + variance */}
                    <div className="pt-1.5 border-t space-y-1.5" style={{ borderColor: colors.border }}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <ReconRow label="Cash On Hand (Counted)" value={declared.toFixed(2)} highlight />
                        </div>
                        {isOpen && (
                          <button
                            onClick={() => setCountCashOpen(true)}
                            style={{ fontSize: 10, padding: '1px 6px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', flexShrink: 0 }}
                          >
                            <Calculator style={{ width: 9, height: 9 }} /> Count Cash
                          </button>
                        )}
                      </div>
                      {isOpen ? (
                        hasCounted ? (
                          <VarianceRow variance={balance.toFixed(2)} />
                        ) : (
                          <div className="flex justify-between items-center rounded px-2 py-1.5 text-sm" style={{ background: colors.toolbar }}>
                            <span style={{ color: colors.textSecondary }}>Balance (Variance)</span>
                            <span className="text-xs italic" style={{ color: colors.textSecondary }}>Count cash to see</span>
                          </div>
                        )
                      ) : (
                        <VarianceRow variance={balance.toFixed(2)} />
                      )}
                    </div>

                    {/* Fin Period Cumulative */}
                    <div className="pt-1.5 border-t flex justify-between text-sm font-medium" style={{ borderColor: colors.border }}>
                      <span style={{ color: colors.textSecondary }}>Fin Period Cumulative Balance</span>
                      <span className="font-mono" style={{ color: finCum.isZero() ? colors.textSecondary : finCum.gte(0) ? colors.process : colors.danger }}>
                        {finCum.gt(0) ? '+' : ''}R {finCum.toFixed(2)}
                      </span>
                    </div>

                    {/* Submitted denomination breakdown (not open) */}
                    {cashUp.status !== 'open' && cashUp.denominations && Object.keys(cashUp.denominations).length > 0 && (
                      <div className="pt-2 border-t" style={{ borderColor: colors.border }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textSecondary }}>Denomination Breakdown</p>
                        <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                          {DENOMINATIONS.map((d) => {
                            const c = cashUp.denominations![String(d)] ?? 0
                            if (c === 0) return null
                            const val = new Decimal(c).times(d).div(100)
                            return (
                              <div key={d} className="flex items-center gap-1.5 text-xs">
                                <span className="font-mono font-semibold w-8 text-right shrink-0" style={{ color: colors.textPrimary }}>{DENOMINATION_LABELS[d]}</span>
                                <span style={{ color: colors.textSecondary }}>×{c}</span>
                                <span className="font-mono ml-auto" style={{ color: colors.textPrimary }}>R {val.toFixed(2)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Notes (submitted/approved) */}
                    {cashUp.status !== 'open' && cashUp.notes && (
                      <p className="pt-1.5 border-t text-sm italic" style={{ borderColor: colors.border, color: colors.textSecondary }}>
                        &quot;{cashUp.notes}&quot;
                      </p>
                    )}

                    {/* Approve button */}
                    {cashUp.status === 'submitted' && (
                      <div className="pt-2 border-t flex justify-end" style={{ borderColor: colors.border }}>
                        {isManager ? (
                          <button
                            onClick={handleApprove}
                            disabled={approving}
                            style={{
                              fontSize: 10,
                              padding: '1px 6px',
                              background: '#E0E0E0',
                              border: '1px solid #999',
                              borderRadius: 2,
                              cursor: approving ? 'not-allowed' : 'pointer',
                              opacity: approving ? 0.6 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                            onMouseEnter={(e) => { if (!approving) e.currentTarget.style.background = '#D0D0D0' }}
                            onMouseLeave={(e) => { if (!approving) e.currentTarget.style.background = '#E0E0E0' }}
                          >
                            {approving ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />Approving...</> : <><Lock style={{ width: 9, height: 9 }} />Approve Cash-Up</>}
                          </button>
                        ) : (
                          <p className="text-sm" style={{ color: colors.textSecondary }}>Awaiting manager approval</p>
                        )}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* ── RIGHT: denomination count (open) + panels ────────────── */}
                  <div className="lg:col-span-2 flex flex-col gap-3">

                    {/* Unpaid cards */}
                    <UnpaidCard
                      label="Today Unpaid Cash"
                      total={stats?.unpaidToday?.total ?? '0'}
                      count={stats?.unpaidToday?.count ?? 0}
                      href="/app/purchases/unpaid"
                    />
                    <UnpaidCard
                      label="Total Unpaid Cash"
                      total={stats?.unpaidAllTime?.total ?? '0'}
                      count={stats?.unpaidAllTime?.count ?? 0}
                      href="/app/purchases/unpaid"
                    />

                    {/* Card / EFT sales (submitted/approved) */}
                    {!isOpen && new Decimal(cashUp.cardPaymentsTotal ?? '0').gt(0) && (
                      <div className="rounded border bg-white overflow-hidden" style={{ borderColor: colors.border }}>
                        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)' }}>
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Card / EFT Sales</span>
                        </div>
                        <div className="p-3">
                          <p className="font-mono font-bold" style={{ color: colors.process }}>R {new Decimal(cashUp.cardPaymentsTotal).toFixed(2)}</p>
                          <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>Excluded from cash reconciliation</p>
                        </div>
                      </div>
                    )}

                    {/* Today's Expenses */}
                    {expenses.length > 0 && (
                      <div className="rounded border bg-white overflow-hidden" style={{ borderColor: colors.border }}>
                        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)' }}>
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Today&apos;s Expenses</span>
                        </div>
                        <div className="p-3 space-y-2">
                          {expenses.map((e) => (
                            <div key={e.id} className="flex items-start justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <p className="font-medium truncate" style={{ color: colors.textPrimary }}>{e.description || e.expenseType.name}</p>
                                <p style={{ color: colors.textSecondary }}>{e.expenseType.name} · {e.paymentMethod}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-mono font-semibold" style={{ color: colors.textPrimary }}>R {new Decimal(e.amount).toFixed(2)}</p>
                                {e.status === 'approved' ? (
                                  <span className="text-[10px] font-medium" style={{ color: colors.action }}>✓ approved</span>
                                ) : isManager ? (
                                  <button
                                    onClick={() => handleApproveExpense(e.id)}
                                    disabled={approvingExpense === e.id}
                                    className="text-[10px] font-medium underline disabled:opacity-50"
                                    style={{ color: colors.warning }}
                                  >
                                    {approvingExpense === e.id ? 'Approving…' : 'Approve'}
                                  </button>
                                ) : (
                                  <span className="text-[10px]" style={{ color: colors.textSecondary }}>pending</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      {countCashOpen && (
        <CountCashModal
          counts={counts} setCounts={setCounts}
          notes={notes} setNotes={setNotes}
          submitting={submitting} handleSubmit={handleSubmit}
          onClose={() => setCountCashOpen(false)}
        />
      )}
    </PageShell>
  )
}
