'use client'

import { useState } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Clock, Loader2, Lock } from 'lucide-react'
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
  systemCashSales:     string
  systemCashPurchases: string
  systemCashPayments:  string
  systemCashExpected:  string
  declaredCash?:       string
  variance?:           string
  notes?:              string
  denominations?: Record<string, number>
}

// ─── Denomination input row ───────────────────────────────────────────────────
function DenomRow({
  denom,
  count,
  onChange,
  disabled,
}: {
  denom: Denomination
  count: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const label   = DENOMINATION_LABELS[denom]
  const centVal = denom
  const value   = new Decimal(count).times(centVal).div(100)

  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-right font-mono text-sm font-semibold text-gray-700">{label}</span>
      <span className="text-gray-400 text-xs">×</span>
      <Input
        type="number"
        min={0}
        value={count === 0 ? '' : count}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className="w-20 text-right font-mono"
        disabled={disabled}
        placeholder="0"
      />
      <span className="text-gray-400 text-xs">=</span>
      <span className="w-20 text-right font-mono text-sm text-gray-700">
        R {value.toFixed(2)}
      </span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CashUpPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  // Today's date YYYY-MM-DD
  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const KEY = '/api/cashup?today=1'
  const { data, isLoading } = useSWR<{ cashUp: CashUp | null }>(KEY, fetcher)
  const cashUp = data?.cashUp ?? null

  const [opening, setOpening] = useState(false)
  const [counts, setCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]))
  )
  const [notes, setNotes]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving]   = useState(false)

  // Declared cash calculated from denomination counts
  const declaredCash = DENOMINATIONS.reduce((acc, d) => {
    return acc.plus(new Decimal(counts[d] ?? 0).times(d).div(100))
  }, new Decimal(0))

  // ── Open session ─────────────────────────────────────────────────────────
  async function handleOpen() {
    setOpening(true)
    const res = await fetch('/api/cashup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDate: today }),
    })
    setOpening(false)
    if (res.ok) {
      toast.success('Cash-up session opened')
      swrMutate(KEY)
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to open session')
    }
  }

  // ── Submit (cashier declares) ─────────────────────────────────────────────
  async function handleSubmit() {
    if (!cashUp) return
    setSubmitting(true)

    // Build denominations map (exclude zeros)
    const denoms: Record<string, number> = {}
    for (const d of DENOMINATIONS) {
      const c = counts[d] ?? 0
      if (c > 0) denoms[String(d)] = c
    }

    const res = await fetch(`/api/cashup/${cashUp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        denominations: denoms,
        declaredCash:  declaredCash.toNumber(),
        notes:         notes || undefined,
      }),
    })
    setSubmitting(false)

    if (res.ok) {
      toast.success('Cash-up submitted for approval')
      swrMutate(KEY)
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to submit cash-up')
    }
  }

  // ── Approve (manager) ─────────────────────────────────────────────────────
  async function handleApprove() {
    if (!cashUp) return
    setApproving(true)
    const res = await fetch(`/api/cashup/${cashUp.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setApproving(false)

    if (res.ok) {
      toast.success('Cash-up approved')
      swrMutate(KEY)
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to approve cash-up')
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cash-Up</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {today} · Daily cash reconciliation
        </p>
      </div>

      {/* No session yet */}
      {!cashUp && (
        <div className="bg-white rounded-xl border p-8 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-1">No session open for today</p>
          <p className="text-sm text-gray-400 mb-5">Open a session to begin tracking today's cash.</p>
          <Button onClick={handleOpen} disabled={opening}>
            {opening ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening...</> : 'Open Session'}
          </Button>
        </div>
      )}

      {/* Session exists */}
      {cashUp && (
        <>
          {/* Status banner */}
          <div className="flex items-center gap-3">
            {cashUp.status === 'open'      && <Badge className="bg-yellow-100 text-yellow-700">Open</Badge>}
            {cashUp.status === 'submitted' && <Badge className="bg-blue-100 text-blue-700">Submitted — Awaiting Approval</Badge>}
            {cashUp.status === 'approved'  && <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>}
            {cashUp.approvedAt && (
              <span className="text-xs text-gray-400">
                {new Date(cashUp.approvedAt).toLocaleString('en-ZA')}
              </span>
            )}
          </div>

          {/* System totals card */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-gray-900 mb-4">System Totals (Cash Transactions)</h2>
            <div className="space-y-2 text-sm">
              <TotalRow label="Cash Sales received"    value={cashUp.systemCashSales}     positive />
              <TotalRow label="Cash Purchases paid out" value={cashUp.systemCashPurchases} negative />
              <TotalRow label="Account Payments paid out" value={cashUp.systemCashPayments} negative />
              <div className="pt-2 border-t">
                <TotalRow
                  label="Expected float in drawer"
                  value={cashUp.systemCashExpected}
                  highlight
                />
              </div>
            </div>
          </div>

          {/* Denomination entry (only for open sessions) */}
          {cashUp.status === 'open' && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Count Your Cash</h2>
              <div className="space-y-2">
                {DENOMINATIONS.map((d) => (
                  <DenomRow
                    key={d}
                    denom={d}
                    count={counts[d] ?? 0}
                    onChange={(v) => setCounts((prev) => ({ ...prev, [d]: v }))}
                    disabled={submitting}
                  />
                ))}
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="font-semibold text-gray-700">Declared Total</span>
                <span className="font-mono text-lg font-bold text-gray-900">
                  R {declaredCash.toFixed(2)}
                </span>
              </div>

              {/* Variance preview */}
              {(() => {
                const expected = new Decimal(cashUp.systemCashExpected ?? '0')
                const variance = declaredCash.minus(expected)
                const isZero   = variance.isZero()
                const isOver   = variance.gt(0)
                return (
                  <div className={`mt-2 flex items-center justify-between text-sm rounded-lg px-3 py-2 ${
                    isZero ? 'bg-green-50 text-green-700' :
                    isOver ? 'bg-blue-50 text-blue-700' :
                             'bg-red-50 text-red-700'
                  }`}>
                    <span>Variance</span>
                    <span className="font-mono font-semibold">
                      {isOver ? '+' : ''}{variance.toFixed(2)}
                    </span>
                  </div>
                )
              })()}

              <div className="mt-4">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                  placeholder="Any comments about the count..."
                  className="mt-1"
                  rows={2}
                  disabled={submitting}
                />
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                    : 'Submit Cash-Up'}
                </Button>
              </div>
            </div>
          )}

          {/* Submitted — show declared + variance, approve button */}
          {cashUp.status === 'submitted' && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Cashier Declaration</h2>

              {/* Denomination breakdown */}
              {cashUp.denominations && Object.keys(cashUp.denominations).length > 0 && (
                <div className="mb-4 space-y-1">
                  {DENOMINATIONS.map((d) => {
                    const c = cashUp.denominations![String(d)] ?? 0
                    if (c === 0) return null
                    const val = new Decimal(c).times(d).div(100)
                    return (
                      <div key={d} className="flex items-center gap-3 text-sm">
                        <span className="w-12 text-right font-mono font-semibold text-gray-600">
                          {DENOMINATION_LABELS[d]}
                        </span>
                        <span className="text-gray-400">×</span>
                        <span className="w-8 text-right font-mono text-gray-700">{c}</span>
                        <span className="text-gray-400">=</span>
                        <span className="font-mono text-gray-700">R {val.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="space-y-2 text-sm pt-2 border-t">
                <TotalRow label="Declared cash" value={cashUp.declaredCash ?? '0'} highlight />
                <TotalRow label="Expected float" value={cashUp.systemCashExpected} />
                {cashUp.variance !== undefined && (
                  <VarianceRow variance={cashUp.variance} />
                )}
              </div>

              {cashUp.notes && (
                <p className="mt-3 text-sm text-gray-500 italic">"{cashUp.notes}"</p>
              )}

              {isManager && (
                <div className="mt-5 flex justify-end">
                  <Button onClick={handleApprove} disabled={approving}>
                    {approving
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</>
                      : <><Lock className="w-4 h-4 mr-2" />Approve Cash-Up</>}
                  </Button>
                </div>
              )}
              {!isManager && (
                <p className="mt-4 text-sm text-center text-gray-400">Awaiting manager approval</p>
              )}
            </div>
          )}

          {/* Approved summary */}
          {cashUp.status === 'approved' && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Approved Summary</h2>
              <div className="space-y-2 text-sm">
                <TotalRow label="Cash Sales"      value={cashUp.systemCashSales}     positive />
                <TotalRow label="Cash Purchases"  value={cashUp.systemCashPurchases} negative />
                <TotalRow label="Cash Payments"   value={cashUp.systemCashPayments}  negative />
                <TotalRow label="Expected Float"  value={cashUp.systemCashExpected}  highlight />
                <TotalRow label="Declared Cash"   value={cashUp.declaredCash ?? '0'} />
                {cashUp.variance !== undefined && (
                  <VarianceRow variance={cashUp.variance} />
                )}
              </div>
              {cashUp.notes && (
                <p className="mt-3 text-sm text-gray-500 italic">"{cashUp.notes}"</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function TotalRow({
  label,
  value,
  positive,
  negative,
  highlight,
}: {
  label: string
  value: string | undefined
  positive?: boolean
  negative?: boolean
  highlight?: boolean
}) {
  const n = new Decimal(value ?? '0')
  return (
    <div className={`flex justify-between ${highlight ? 'font-semibold' : ''}`}>
      <span className={`text-gray-600 ${highlight ? 'text-gray-900' : ''}`}>{label}</span>
      <span className={`font-mono ${positive ? 'text-green-700' : negative ? 'text-red-700' : 'text-gray-900'}`}>
        {negative ? '-' : ''}R {n.abs().toFixed(2)}
      </span>
    </div>
  )
}

function VarianceRow({ variance }: { variance: string }) {
  const v   = new Decimal(variance)
  const pos = v.gte(0)
  return (
    <div className={`flex justify-between font-semibold rounded px-2 py-1 ${
      v.isZero() ? 'bg-green-50 text-green-700' :
      pos        ? 'bg-blue-50 text-blue-700' :
                   'bg-red-50 text-red-700'
    }`}>
      <span>Variance</span>
      <span className="font-mono">{pos && !v.isZero() ? '+' : ''}R {v.toFixed(2)}</span>
    </div>
  )
}
