'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, Calendar, PlusCircle, Undo2, ChevronLeft, ChevronRight } from 'lucide-react'
import Decimal from 'decimal.js'
import { colors } from '@/lib/design-tokens'
import { z } from 'zod'
import { Btn, PortalPage, TH, TD, HEADER_GRAD } from '@/components/rpx'
import { CARD_BORDER } from '@/components/rpx/styles'
import { PANEL, PANEL_HEAD } from '@/components/legacy/legacyPanel'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TopUpFormSchema = z.object({
  amount: z.string().min(1, 'Amount required').regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount'),
  note: z.string().max(200).optional(),
})
type TopUpFormValues = z.infer<typeof TopUpFormSchema>

type CashFloat = {
  id: string
  floatDate: string
  openingAmount: string
  closingAmount?: string | null
  currentBalance: string
  isLastEntry: boolean
  canReverse: boolean
  notes?: string | null
  createdAt: string
}

type FloatMovement = {
  id: string
  movementType: 'top_up' | 'opening' | 'withdrawal' | 'adjustment'
  amount: string
  balanceAfter: string
  referenceNote?: string | null
  createdAt: string
}

type CurrentFloatResponse = {
  float: (CashFloat & { movements: FloatMovement[]; currentBalance: string }) | null
}

type TodayFloatResponse = {
  today: CashFloat | null
  suggestedAmount: string | null
  suggestedDate: string | null
}

type LiveStats = {
  cashSales: string
  cardSales: string
  cashPurchases: string
  cashPayments: string
  expenses: string
  loanAdvance: string
  loanRepayment: string
  floatTopUps: string
}

type CashUp = {
  id: string
  sessionDate: string
  status: 'open' | 'submitted' | 'approved'
  openingBalance: string
}

function todayISO() {
  return new Date().toISOString().split('T')[0]!
}

export default function FloatPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { isLoading: loadingToday } = useSWR<TodayFloatResponse>('/api/float/today', fetcher)
  const { data: history, isLoading: loadingHistory } = useSWR<CashFloat[]>('/api/float', fetcher)
  const { data: currentData, mutate: mutateCurrentFloat } = useSWR<CurrentFloatResponse>('/api/float/current', fetcher, { refreshInterval: 5000 })
  const cashUpKey = '/api/cashup?today=1'
  const { data: cashUpData, mutate: mutateCashUp } = useSWR<{ cashUp: CashUp | null }>(cashUpKey, fetcher, { refreshInterval: 5000 })
  // Use the cashup session date for live-stats, not today's date
  // This ensures we get stats for the actual cashup session (which may span past midnight)
  const cashUpSessionDate = cashUpData?.cashUp?.sessionDate?.split('T')[0] ?? todayISO()
  const liveStatsKey = `/api/cashup/live-stats?date=${cashUpSessionDate}`
  const { data: liveStats, mutate: mutateLiveStats } = useSWR<LiveStats>(liveStatsKey, fetcher, { refreshInterval: 5000 })
  const [saving, setSaving] = useState(false)
  const [reversingMovement, setReversingMovement] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 5

  const movements = currentData?.float?.movements ?? []

  // Get opening balance from cashup (carry-forward from previous day)
  const cashUpOpeningBalance = cashUpData?.cashUp?.openingBalance
    ? new Decimal(cashUpData.cashUp.openingBalance)
    : null

  // Calculate Cal Float (expected cash in drawer) from live stats
  // Formula: CashUp Opening Balance + Today's Float Top-ups + Cash Sales - Cash Purchases - Cash Payments - Expenses - Loan Advance + Loan Repayment
  // Note: floatTopUps from live-stats includes today's float opening + any top-ups during the day
  const calFloat = liveStats && cashUpOpeningBalance !== null
    ? cashUpOpeningBalance
        .plus(new Decimal(liveStats.floatTopUps ?? '0'))
        .plus(new Decimal(liveStats.cashSales ?? '0'))
        .minus(new Decimal(liveStats.cashPurchases ?? '0'))
        .minus(new Decimal(liveStats.cashPayments ?? '0'))
        .minus(new Decimal(liveStats.expenses ?? '0'))
        .minus(new Decimal(liveStats.loanAdvance ?? '0'))
        .plus(new Decimal(liveStats.loanRepayment ?? '0'))
    : null

  // ── Top-up form (add to existing balance) ──────────────────────────────────
  const topUpForm = useForm<TopUpFormValues>({
    resolver: zodResolver(TopUpFormSchema),
    defaultValues: { amount: '', note: '' },
  })

  async function onTopUp(data: TopUpFormValues) {
    setSaving(true)
    try {
      const res = await fetch('/api/float/top-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: data.amount, note: data.note }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Top-up failed')
      }
      toast.success(`Float topped up by R ${new Decimal(data.amount).toFixed(2)}`)
      topUpForm.reset({ amount: '', note: '' })
      // Instantly refresh all float-related data
      await Promise.all([
        mutate('/api/float/today'),
        mutate('/api/float'),
        mutateCurrentFloat(),
        mutateLiveStats(),
        mutateCashUp(),
      ])
      // Float recorded — close the module and return to the dashboard
      router.push('/app/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to top up float')
    } finally {
      setSaving(false)
    }
  }

  async function handleReverseMovement(movementId: string) {
    setReversingMovement(true)
    try {
      const res = await fetch(`/api/float/movement/${movementId}/reverse`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Reversal failed')
      }
      toast.success('Movement reversed')
      // Instantly refresh all float-related data
      await Promise.all([
        mutate('/api/float'),
        mutate('/api/float/today'),
        mutateCurrentFloat(),
        mutateLiveStats(),
        mutateCashUp(),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reverse movement')
    } finally {
      setReversingMovement(false)
    }
  }

  return (
    <PortalPage title="Cash Float">
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="max-w-3xl mx-auto w-full space-y-2.5 pb-4" style={{ padding: '8px 8px 0' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">

          {/* Today's float status + action forms */}
          <div style={PANEL}>
            <div style={PANEL_HEAD}>
              <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Today&apos;s Float</span>
            </div>
            <div className="p-3">

            {loadingToday ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Balance cards */}
                <div className="px-3 py-2.5" style={{ background: colors.warningBg, border: `1px solid ${colors.warning}40`, borderRadius: 3 }}>
                  {/* Opening Balance from Cashup (carry-forward from previous day) */}
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Opening Balance</p>
                  <p className="font-mono font-bold mt-1" style={{ fontSize: 20, color: colors.textPrimary }}>
                    R {cashUpOpeningBalance?.toFixed(2) ?? '0.00'}
                  </p>
                  {/* Current Balance (Expected in Drawer) */}
                  <p className="text-xs font-semibold uppercase tracking-wide mt-2.5" style={{ color: colors.action }}>Current Balance (Expected in Drawer)</p>
                  <p className="font-mono font-bold" style={{ fontSize: 20, color: colors.action }}>
                    R {calFloat?.toFixed(2) ?? '0.00'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    {new Date().toLocaleDateString('en-ZA', { dateStyle: 'full' })}
                  </p>
                </div>

                {/* Top-up form */}
                {isManager && (
                  <div className="p-3 space-y-2" style={{ background: colors.actionBg, border: `1px solid ${colors.action}30`, borderRadius: 3 }}>
                    <div className="flex items-center gap-1.5">
                      <PlusCircle className="w-3.5 h-3.5" style={{ color: colors.action }} />
                      <p className="text-sm font-semibold" style={{ color: colors.action }}>Add Top-Up</p>
                    </div>
                    <form onSubmit={topUpForm.handleSubmit(onTopUp)} className="space-y-2">
                      <div>
                        <Label className="text-xs" style={{ color: colors.textSecondary }}>Additional Amount (R)</Label>
                        <Input
                          {...topUpForm.register('amount')}
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="mt-1 h-8 text-xs font-mono border-[#E0E0E0]"
                          disabled={saving}
                          placeholder="0.00"
                        />
                        {topUpForm.formState.errors.amount && (
                          <p className="text-xs mt-1" style={{ color: colors.danger }}>{topUpForm.formState.errors.amount.message}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs" style={{ color: colors.textSecondary }}>Note (optional)</Label>
                        <Input
                          {...topUpForm.register('note')}
                          className="mt-1 h-8 text-xs border-[#E0E0E0]"
                          disabled={saving}
                          placeholder="e.g. Additional cash from safe"
                        />
                      </div>
                      <Btn type="submit" loading={saving} style={{ width: '100%', justifyContent: 'center' }}>
                        Add to Float
                      </Btn>
                    </form>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* History */}
          <div style={PANEL}>
            <div className="flex items-center justify-between" style={PANEL_HEAD}>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Float History</h2>
              </div>
            </div>

            {loadingHistory ? (
              <div className="flex items-center gap-2 text-sm p-3" style={{ color: colors.textSecondary }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : !history?.length ? (
              <div className="text-center py-5 text-sm" style={{ color: colors.textSecondary }}>No float history</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                        <th style={TH}>Date</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Opening Float</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Current Float</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((f, i) => (
                        <tr key={f.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: `1px solid #F0F0F0` }}>
                          <td style={TD}>
                            <p className="font-medium" style={{ fontSize: 12, color: colors.textPrimary }}>
                              {new Date(f.floatDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            {f.notes && <p className="mt-0.5" style={{ fontSize: 11, color: colors.textSecondary }}>{f.notes}</p>}
                          </td>
                          <td style={{ ...TD, textAlign: 'right' }}>
                            <span className="font-mono font-semibold" style={{ fontSize: 12, color: colors.textPrimary }}>
                              R {new Decimal(f.openingAmount).toFixed(2)}
                            </span>
                          </td>
                          <td style={{ ...TD, textAlign: 'right' }}>
                            <span className="font-mono font-semibold" style={{ fontSize: 12, color: f.closingAmount ? colors.textSecondary : colors.action }}>
                              R {new Decimal(f.currentBalance).toFixed(2)}
                            </span>
                            {f.closingAmount && (
                              <span className="ml-1" style={{ fontSize: 11, color: colors.textSecondary }}>(closed)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {history.length > HISTORY_PAGE_SIZE && (
                  <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: CARD_BORDER, background: colors.toolbar }}>
                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                      Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPage * HISTORY_PAGE_SIZE, history.length)} of {history.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Btn size="sm" icon={ChevronLeft} disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)} />
                      <span className="text-xs px-2" style={{ color: colors.textPrimary }}>
                        Page {historyPage} of {Math.ceil(history.length / HISTORY_PAGE_SIZE)}
                      </span>
                      <Btn
                        size="sm"
                        icon={ChevronRight}
                        disabled={historyPage >= Math.ceil(history.length / HISTORY_PAGE_SIZE)}
                        onClick={() => setHistoryPage(p => p + 1)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Today's Movements - always show */}
        <div style={PANEL}>
          <div className="flex items-center justify-between" style={PANEL_HEAD}>
            <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Today&apos;s Float Movements</span>
            <span className="text-xs" style={{ color: colors.textSecondary }}>{movements.length} movement{movements.length !== 1 ? 's' : ''}</span>
          </div>
          {movements.length === 0 ? (
            <div className="text-center py-5 text-sm" style={{ color: colors.textSecondary }}>
              No float movements yet today
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                    {['Time', 'Type', 'Amount', 'Expected in Drawer', 'Note', ...(isManager ? [''] : [])].map((h, idx) => (
                      <th key={idx} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, i) => {
                    const isLastMovement = i === movements.length - 1
                    // For the last movement, use calFloat directly so it matches "Current Balance"
                    // For earlier movements, calculate based on that movement's float balance
                    const floatBalanceAfter = new Decimal(m.balanceAfter)
                    const expectedInDrawer = isLastMovement && calFloat
                      ? calFloat
                      : (cashUpOpeningBalance && liveStats
                          ? cashUpOpeningBalance
                              .plus(floatBalanceAfter)
                              .plus(new Decimal(liveStats.cashSales ?? '0'))
                              .minus(new Decimal(liveStats.cashPurchases ?? '0'))
                              .minus(new Decimal(liveStats.cashPayments ?? '0'))
                              .minus(new Decimal(liveStats.expenses ?? '0'))
                              .minus(new Decimal(liveStats.loanAdvance ?? '0'))
                              .plus(new Decimal(liveStats.loanRepayment ?? '0'))
                          : floatBalanceAfter)
                    return (
                      <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: `1px solid #F0F0F0` }}>
                        <td style={{ padding: '6px 12px', fontSize: 11, color: colors.textSecondary }}>
                          {new Date(m.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '6px 12px' }}>
                          <span style={{
                            display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                            ...(m.movementType === 'top_up'
                              ? { background: colors.actionBg, color: colors.action }
                              : { background: '#F0F0F0', color: colors.textSecondary }),
                          }}>
                            {m.movementType === 'top_up' ? 'Top-Up' : m.movementType}
                          </span>
                        </td>
                        <td style={{ padding: '6px 12px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: colors.action }}>
                          +R {new Decimal(m.amount).toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 12px', fontSize: 12, fontFamily: 'monospace', color: colors.action }}>
                          R {expectedInDrawer.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 12px', fontSize: 11, color: colors.textSecondary }}>
                          {m.referenceNote ?? '—'}
                        </td>
                        {isManager && (
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                            {isLastMovement && (
                              <Btn size="sm" icon={Undo2} loading={reversingMovement} onClick={() => handleReverseMovement(m.id)}>
                                Reverse
                              </Btn>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </div>
    </PortalPage>
  )
}
