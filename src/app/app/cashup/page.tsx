'use client'

import { useState } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Clock, Loader2, Lock, Info } from 'lucide-react'
import { DENOMINATIONS, DENOMINATION_LABELS, type Denomination } from '@/lib/schemas/cashup'

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
  // System-calculated
  openingBalance:      string
  systemCashSales:     string
  systemCashPurchases: string
  systemCashPayments:  string
  systemCashExpected:  string
  expensesTotal:       string
  cardPaymentsTotal:   string
  // Cashier-entered
  drawingsReceived:    string
  loansTotal:          string
  declaredCash?:       string
  variance?:           string
  notes?:              string
  denominations?: Record<string, number>
}

// ─── Denomination input row ───────────────────────────────────────────────────
function DenomRow({
  denom, count, onChange, disabled,
}: { denom: Denomination; count: number; onChange: (v: number) => void; disabled: boolean }) {
  const label   = DENOMINATION_LABELS[denom]
  const value   = new Decimal(count).times(denom).div(100)
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-right font-mono text-sm font-semibold" style={{ color: '#212529' }}>{label}</span>
      <span className="text-xs" style={{ color: '#6C757D' }}>×</span>
      <Input
        type="number" min={0}
        value={count === 0 ? '' : count}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className="w-20 text-right font-mono border-[#E0E0E0]"
        disabled={disabled} placeholder="0"
      />
      <span className="text-xs" style={{ color: '#6C757D' }}>=</span>
      <span className="w-20 text-right font-mono text-sm" style={{ color: '#212529' }}>R {value.toFixed(2)}</span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CashUpPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const KEY = '/api/cashup?today=1'
  const { data, isLoading } = useSWR<{ cashUp: CashUp | null }>(KEY, fetcher)
  const cashUp = data?.cashUp ?? null

  const [opening, setOpening]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving]   = useState(false)
  const [notes, setNotes]           = useState('')
  const [drawings, setDrawings]     = useState('0')
  const [loans, setLoans]           = useState('0')
  const [counts, setCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]))
  )

  const declaredCash = DENOMINATIONS.reduce((acc, d) => {
    return acc.plus(new Decimal(counts[d] ?? 0).times(d).div(100))
  }, new Decimal(0))

  async function handleOpen() {
    setOpening(true)
    const res = await fetch('/api/cashup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDate: today }),
    })
    setOpening(false)
    if (res.ok) { toast.success('Cash-up session opened'); swrMutate(KEY) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to open session') }
  }

  async function handleSubmit() {
    if (!cashUp) return
    setSubmitting(true)
    const denoms: Record<string, number> = {}
    for (const d of DENOMINATIONS) {
      const c = counts[d] ?? 0
      if (c > 0) denoms[String(d)] = c
    }
    const res = await fetch(`/api/cashup/${cashUp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        denominations:    denoms,
        declaredCash:     declaredCash.toNumber(),
        drawingsReceived: new Decimal(drawings || '0').toFixed(2),
        loansTotal:       new Decimal(loans    || '0').toFixed(2),
        notes:            notes || undefined,
      }),
    })
    setSubmitting(false)
    if (res.ok) { toast.success('Cash-up submitted for approval'); swrMutate(KEY) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to submit cash-up') }
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
    if (res.ok) { toast.success('Cash-up approved'); swrMutate(KEY) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to approve cash-up') }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#6C757D' }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Cash-Up</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>{today} · Daily cash reconciliation</p>
      </div>

      {/* No session yet */}
      {!cashUp && (
        <div className="rounded-lg border p-8 text-center bg-white" style={{ borderColor: '#E0E0E0' }}>
          <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: '#E0E0E0' }} />
          <p className="font-medium mb-1" style={{ color: '#212529' }}>No session open for today</p>
          <p className="text-sm mb-5" style={{ color: '#6C757D' }}>Open a session to begin tracking today&apos;s cash.</p>
          <button
            onClick={handleOpen}
            disabled={opening}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium text-white mx-auto disabled:opacity-50"
            style={{ background: '#217346' }}
          >
            {opening ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Opening…</> : 'Open Session'}
          </button>
        </div>
      )}

      {cashUp && (
        <>
          {/* Status banner */}
          <div className="flex items-center gap-3">
            {cashUp.status === 'open'      && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#FFFBEB', color: '#C9A020' }}>Open</span>}
            {cashUp.status === 'submitted' && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#EBF3FC', color: '#185ABD' }}>Submitted — Awaiting Approval</span>}
            {cashUp.status === 'approved'  && <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F0FBF4', color: '#217346' }}><CheckCircle2 className="w-3 h-3" />Approved</span>}
            {cashUp.approvedAt && (
              <span className="text-xs text-gray-400">{new Date(cashUp.approvedAt).toLocaleString('en-ZA')}</span>
            )}
          </div>

          {/* Opening float info */}
          {new Decimal(cashUp.openingBalance ?? '0').gt(0) && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: '#FFFBEB', border: '1px solid #C9A02040' }}>
              <Info className="w-4 h-4 shrink-0" style={{ color: '#C9A020' }} />
              <span style={{ color: '#92700F' }}>
                Opening float for today: <strong>R {new Decimal(cashUp.openingBalance).toFixed(2)}</strong>
              </span>
            </div>
          )}

          {/* Open: denomination counting + reconciliation */}
          {cashUp.status === 'open' && (
            <>
              {/* Denomination entry */}
              <div className="rounded-lg border p-5 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <h2 className="font-semibold mb-4" style={{ color: '#212529' }}>Count Your Cash</h2>
                <div className="space-y-2">
                  {DENOMINATIONS.map((d) => (
                    <DenomRow
                      key={d} denom={d}
                      count={counts[d] ?? 0}
                      onChange={(v) => setCounts((prev) => ({ ...prev, [d]: v }))}
                      disabled={submitting}
                    />
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <span className="font-semibold" style={{ color: '#212529' }}>Declared Total</span>
                  <span className="font-mono text-lg font-bold" style={{ color: '#212529' }}>R {declaredCash.toFixed(2)}</span>
                </div>
              </div>

              {/* Reconciliation panel */}
              <div className="rounded-lg border p-5 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <h2 className="font-semibold mb-4" style={{ color: '#212529' }}>Reconciliation</h2>
                <div className="space-y-2 text-sm">
                  <ReconRow label="Opening Balance (float)" value={cashUp.openingBalance ?? '0'} positive />
                  <ReconRow label="Cash Sales received" value={cashUp.systemCashSales} positive />
                  <ReconRow label="Cash Purchases paid out" value={cashUp.systemCashPurchases} negative />
                  <ReconRow label="Account Payments paid out" value={cashUp.systemCashPayments} negative />
                  <ReconRow label="Approved Expenses" value={cashUp.expensesTotal ?? '0'} negative />
                  <ReconRow label="Card / EFT Sales (excluded)" value={cashUp.cardPaymentsTotal ?? '0'} muted />

                  {/* Editable fields */}
                  <div className="pt-3 space-y-3 border-t">
                    <div className="flex items-center justify-between">
                      <span style={{ color: '#6C757D' }}>Drawings Received (R)</span>
                      <Input
                        type="number" min="0" step="0.01"
                        value={drawings}
                        onChange={(e) => setDrawings(e.target.value)}
                        className="w-28 text-right font-mono h-8 text-sm"
                        disabled={submitting}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: '#6C757D' }}>Loans (+/-) (R)</span>
                      <Input
                        type="number" step="0.01"
                        value={loans}
                        onChange={(e) => setLoans(e.target.value)}
                        className="w-28 text-right font-mono h-8 text-sm"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  {/* Calculated expected */}
                  {(() => {
                    const opening   = new Decimal(cashUp.openingBalance ?? '0')
                    const sales     = new Decimal(cashUp.systemCashSales ?? '0')
                    const purchases = new Decimal(cashUp.systemCashPurchases ?? '0')
                    const payments  = new Decimal(cashUp.systemCashPayments ?? '0')
                    const expenses  = new Decimal(cashUp.expensesTotal ?? '0')
                    const draw      = new Decimal(drawings || '0')
                    const loan      = new Decimal(loans || '0')
                    const expected  = opening.plus(sales).minus(purchases).minus(payments).minus(expenses).minus(draw).plus(loan)
                    const variance  = declaredCash.minus(expected)
                    const isZero    = variance.isZero()
                    const isOver    = variance.gt(0)
                    return (
                      <>
                        <div className="pt-3 border-t flex justify-between font-semibold">
                          <span style={{ color: '#212529' }}>Expected in Drawer</span>
                          <span className="font-mono text-gray-900">R {expected.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span style={{ color: '#212529' }}>Declared (counted)</span>
                          <span className="font-mono text-gray-900">R {declaredCash.toFixed(2)}</span>
                        </div>
                        <div
                          className="flex justify-between font-semibold rounded px-2 py-1"
                          style={isZero ? { background: '#F0FBF4', color: '#217346' } : isOver ? { background: '#EBF3FC', color: '#185ABD' } : { background: '#FEF2F2', color: '#C0392B' }}
                        >
                          <span>Variance</span>
                          <span className="font-mono">{isOver && !isZero ? '+' : ''}R {variance.toFixed(2)}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>

                <div className="mt-4">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    placeholder="Any comments about the count..."
                    className="mt-1" rows={2} disabled={submitting}
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleSubmit} disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : 'Submit Cash-Up'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Submitted — view declaration + approve */}
          {cashUp.status === 'submitted' && (
            <div className="rounded-lg border p-5 bg-white" style={{ borderColor: '#E0E0E0' }}>
              <h2 className="font-semibold mb-4" style={{ color: '#212529' }}>Cashier Declaration</h2>

              {cashUp.denominations && Object.keys(cashUp.denominations).length > 0 && (
                <div className="mb-4 space-y-1">
                  {DENOMINATIONS.map((d) => {
                    const c = cashUp.denominations![String(d)] ?? 0
                    if (c === 0) return null
                    const val = new Decimal(c).times(d).div(100)
                    return (
                      <div key={d} className="flex items-center gap-3 text-sm">
                        <span className="w-12 text-right font-mono font-semibold" style={{ color: '#212529' }}>{DENOMINATION_LABELS[d]}</span>
                        <span style={{ color: '#6C757D' }}>×</span>
                        <span className="w-8 text-right font-mono" style={{ color: '#212529' }}>{c}</span>
                        <span style={{ color: '#6C757D' }}>=</span>
                        <span className="font-mono" style={{ color: '#212529' }}>R {val.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="space-y-2 text-sm pt-2 border-t">
                <ReconRow label="Opening Balance" value={cashUp.openingBalance ?? '0'} positive />
                <ReconRow label="Cash Sales" value={cashUp.systemCashSales} positive />
                <ReconRow label="Cash Purchases" value={cashUp.systemCashPurchases} negative />
                <ReconRow label="Cash Payments" value={cashUp.systemCashPayments} negative />
                <ReconRow label="Expenses" value={cashUp.expensesTotal ?? '0'} negative />
                <ReconRow label="Drawings Received" value={cashUp.drawingsReceived ?? '0'} negative />
                <ReconRow label="Loans" value={cashUp.loansTotal ?? '0'} />
                <div className="pt-2 border-t">
                  <ReconRow label="Expected in Drawer" value={cashUp.systemCashExpected} highlight />
                  <ReconRow label="Declared Cash" value={cashUp.declaredCash ?? '0'} highlight />
                  {cashUp.variance !== undefined && <VarianceRow variance={cashUp.variance} />}
                </div>
              </div>

              {cashUp.notes && <p className="mt-3 text-sm italic" style={{ color: '#6C757D' }}>&quot;{cashUp.notes}&quot;</p>}

              {isManager ? (
                <div className="mt-5 flex justify-end">
                  <Button onClick={handleApprove} disabled={approving}>
                    {approving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</> : <><Lock className="w-4 h-4 mr-2" />Approve Cash-Up</>}
                  </Button>
                </div>
              ) : (
                <p className="mt-4 text-sm text-center" style={{ color: '#6C757D' }}>Awaiting manager approval</p>
              )}
            </div>
          )}

          {/* Approved summary */}
          {cashUp.status === 'approved' && (
            <div className="rounded-lg border p-5 bg-white" style={{ borderColor: '#E0E0E0' }}>
              <h2 className="font-semibold mb-4" style={{ color: '#212529' }}>Approved Summary</h2>
              <div className="space-y-2 text-sm">
                <ReconRow label="Opening Balance" value={cashUp.openingBalance ?? '0'} positive />
                <ReconRow label="Cash Sales" value={cashUp.systemCashSales} positive />
                <ReconRow label="Card / EFT Sales" value={cashUp.cardPaymentsTotal ?? '0'} muted />
                <ReconRow label="Cash Purchases" value={cashUp.systemCashPurchases} negative />
                <ReconRow label="Cash Payments" value={cashUp.systemCashPayments} negative />
                <ReconRow label="Expenses" value={cashUp.expensesTotal ?? '0'} negative />
                <ReconRow label="Drawings" value={cashUp.drawingsReceived ?? '0'} negative />
                <ReconRow label="Loans" value={cashUp.loansTotal ?? '0'} />
                <div className="pt-2 border-t">
                  <ReconRow label="Expected in Drawer" value={cashUp.systemCashExpected} highlight />
                  <ReconRow label="Declared Cash" value={cashUp.declaredCash ?? '0'} highlight />
                  {cashUp.variance !== undefined && <VarianceRow variance={cashUp.variance} />}
                </div>
              </div>
              {cashUp.notes && <p className="mt-3 text-sm italic" style={{ color: '#6C757D' }}>&quot;{cashUp.notes}&quot;</p>}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}

// ─── Row helpers ──────────────────────────────────────────────────────────────
function ReconRow({ label, value, positive, negative, highlight, muted }: {
  label: string; value: string | undefined
  positive?: boolean; negative?: boolean; highlight?: boolean; muted?: boolean
}) {
  const n = new Decimal(value ?? '0')
  const labelColor = muted ? '#6C757D' : highlight ? '#212529' : '#6C757D'
  const valueColor = positive ? '#217346' : negative ? '#C0392B' : muted ? '#6C757D' : '#212529'
  return (
    <div className={`flex justify-between ${highlight ? 'font-semibold' : ''}`}>
      <span style={{ color: labelColor }}>{label}</span>
      <span className="font-mono" style={{ color: valueColor }}>
        {negative ? '-' : ''}R {n.abs().toFixed(2)}
      </span>
    </div>
  )
}

function VarianceRow({ variance }: { variance: string }) {
  const v = new Decimal(variance)
  const pos = v.gte(0)
  const style = v.isZero()
    ? { background: '#F0FBF4', color: '#217346' }
    : pos ? { background: '#EBF3FC', color: '#185ABD' }
           : { background: '#FEF2F2', color: '#C0392B' }
  return (
    <div className="flex justify-between font-semibold rounded px-2 py-1 mt-1" style={style}>
      <span>Variance</span>
      <span className="font-mono">{pos && !v.isZero() ? '+' : ''}R {v.toFixed(2)}</span>
    </div>
  )
}
