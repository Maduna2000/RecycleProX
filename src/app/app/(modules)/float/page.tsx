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
import { Loader2, Calendar, PlusCircle, Undo2 } from 'lucide-react'
import Decimal from 'decimal.js'
import { colors } from '@/lib/design-tokens'
import { z } from 'zod'
import { inp, lbl, Btn, PortalPage, PANEL, PANEL_HEAD, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { Dialog } from '@/components/ui/dialog'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { offlineFetcher } from '@/lib/offline/responseCache'
import { floatHistoryFetcher } from '@/lib/offline/fetchers/float'
import { OfflineDataBadge } from '@/components/ui/OfflineDataBadge'
import { useSystemCurrency } from '@/hooks/useSystemCurrency'


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
  const { symbol: currSym } = useSystemCurrency()

  const { isLoading: loadingToday } = useSWR<TodayFloatResponse>('/api/float/today', offlineFetcher)
  const { data: history, isLoading: loadingHistory } = useSWR<CashFloat[]>('/api/float', floatHistoryFetcher)
  const { data: currentData, mutate: mutateCurrentFloat } = useSWR<CurrentFloatResponse>('/api/float/current', offlineFetcher, { refreshInterval: 5000 })
  const cashUpKey = '/api/cashup?today=1'
  const { data: cashUpData, mutate: mutateCashUp } = useSWR<{ cashUp: CashUp | null }>(cashUpKey, offlineFetcher, { refreshInterval: 5000 })
  // Between a session being approved and the next one being opened, no
  // open/submitted session exists for /api/cashup?today=1 to return — fall
  // back to the same carry-forward preview openCashUp itself would use
  // (the just-approved session's declared cash), so Opening/Current
  // Balance don't drop to R 0.00 during that gap.
  const { data: openingPreview } = useSWR<{ canOpen: boolean; safeOpeningBalance?: string }>(
    cashUpData && !cashUpData.cashUp ? '/api/cashup/opening-balance-preview' : null,
    offlineFetcher,
    { refreshInterval: 5000 },
  )
  // Use the cashup session date for live-stats, not today's date
  // This ensures we get stats for the actual cashup session (which may span past midnight)
  const cashUpSessionDate = cashUpData?.cashUp?.sessionDate?.split('T')[0] ?? todayISO()
  const liveStatsKey = `/api/cashup/live-stats?date=${cashUpSessionDate}`
  const { data: liveStats, mutate: mutateLiveStats } = useSWR<LiveStats>(liveStatsKey, offlineFetcher, { refreshInterval: 5000 })
  const [saving, setSaving] = useState(false)
  const [reversingMovement, setReversingMovement] = useState(false)
  const [reversingTarget, setReversingTarget] = useState<FloatMovement | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 5

  const movements = currentData?.float?.movements ?? []

  // Get opening balance from the active session, or — between an approval
  // and the next session opening — the same carry-forward preview a new
  // session would get.
  const cashUpOpeningBalance = cashUpData?.cashUp?.openingBalance
    ? new Decimal(cashUpData.cashUp.openingBalance)
    : openingPreview?.safeOpeningBalance
      ? new Decimal(openingPreview.safeOpeningBalance)
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
      toast.success(`Float topped up by ${currSym} ${new Decimal(data.amount).toFixed(2)}`)
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

  const historyColumns: Column<CashFloat>[] = [
    {
      key: 'date', header: 'Date',
      render: (f) => (
        <>
          <p className="font-medium" style={{ fontSize: 12, color: colors.textPrimary }}>
            {new Date(f.floatDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {f.notes && <p className="mt-0.5" style={{ fontSize: 11, color: colors.textSecondary }}>{f.notes}</p>}
        </>
      ),
    },
    {
      key: 'openingAmount', header: 'Opening Float', width: '130px',
      render: (f) => <span className="font-mono font-semibold" style={{ fontSize: 12, color: colors.textPrimary }}>{currSym} {new Decimal(f.openingAmount).toFixed(2)}</span>,
    },
    {
      key: 'currentBalance', header: 'Current Float', width: '150px',
      render: (f) => (
        <>
          <span className="font-mono font-semibold" style={{ fontSize: 12, color: f.closingAmount ? colors.textSecondary : colors.action }}>
            {currSym} {new Decimal(f.currentBalance).toFixed(2)}
          </span>
          {f.closingAmount && <span className="ml-1" style={{ fontSize: 11, color: colors.textSecondary }}>(closed)</span>}
        </>
      ),
    },
  ]

  const movementColumns: Column<FloatMovement>[] = [
    {
      key: 'time', header: 'Time', width: '70px',
      render: (m) => <span style={{ fontSize: 11, color: colors.textSecondary }}>{new Date(m.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>,
    },
    {
      key: 'type', header: 'Type', width: '90px',
      render: (m) => (
        <span style={{
          display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600,
          ...(m.movementType === 'top_up'
            ? { background: colors.actionBg, color: colors.action }
            : { background: '#F0F0F0', color: colors.textSecondary }),
        }}>
          {m.movementType === 'top_up' ? 'Top-Up' : m.movementType}
        </span>
      ),
    },
    {
      key: 'amount', header: 'Amount', width: '100px',
      render: (m) => <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: colors.action }}>+{currSym} {new Decimal(m.amount).toFixed(2)}</span>,
    },
    {
      key: 'expected', header: 'Expected in Drawer', width: '140px',
      render: (m, i) => {
        const isLastMovement = i === movements.length - 1
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
        return <span style={{ fontSize: 12, fontFamily: 'monospace', color: colors.action }}>{currSym} {expectedInDrawer.toFixed(2)}</span>
      },
    },
    {
      key: 'note', header: 'Note',
      render: (m) => <span style={{ fontSize: 11, color: colors.textSecondary }}>{m.referenceNote ?? '—'}</span>,
    },
    ...(isManager ? [{
      key: 'actions', header: '', width: '100px',
      render: (m: FloatMovement, i: number) => i === movements.length - 1
        ? <Btn size="sm" icon={Undo2} loading={reversingMovement} onClick={() => setReversingTarget(m)}>Reverse</Btn>
        : null,
    }] : []),
  ]

  async function handleReverseMovement(movementId: string, reason: string) {
    setReversingMovement(true)
    try {
      const res = await fetch(`/api/float/movement/${movementId}/reverse`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Reversal failed')
      }
      toast.success('Movement reversed')
      setReversingTarget(null)
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

  // maxWidth (768px, ex-max-w-3xl) is now PortalPage's job entirely — see
  // src/lib/pageWidthCaps.ts, which PageTitleBar reads to cap/border itself
  // to match. The inner wrapper used to duplicate this same cap with its
  // own max-w-3xl class, which stopped this page's content from actually
  // growing when the window is manually resized wider (only the window's
  // border moved) — PortalPage's own cap already relaxes once the window is
  // floating (see useIsWindowFloating), so this wrapper just needs to fill
  // whatever width it's given now.
  return (
    <PortalPage title="Cash Float" maxWidth={768} actions={<OfflineDataBadge />}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="w-full space-y-2.5 pb-4" style={{ padding: '8px 8px 0' }}>
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
                    {currSym} {cashUpOpeningBalance?.toFixed(2) ?? '0.00'}
                  </p>
                  {/* Current Balance (Expected in Drawer) */}
                  <p className="text-xs font-semibold uppercase tracking-wide mt-2.5" style={{ color: colors.action }}>Current Balance (Expected in Drawer)</p>
                  <p className="font-mono font-bold" style={{ fontSize: 20, color: colors.action }}>
                    {currSym} {calFloat?.toFixed(2) ?? '0.00'}
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
                      <p className="text-sm font-semibold" style={{ color: colors.action }}>Add Float</p>
                    </div>
                    <form onSubmit={topUpForm.handleSubmit(onTopUp)} className="space-y-2">
                      <div>
                        <Label className="text-xs" style={{ color: colors.textSecondary }}>Amount ({currSym})</Label>
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

            {!history?.length && !loadingHistory ? (
              <div className="text-center py-5 text-sm" style={{ color: colors.textSecondary }}>No float history</div>
            ) : (
              <div className="p-2">
                <DataTable
                  columns={historyColumns}
                  rows={(history ?? []).slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE)}
                  rowKey={(f) => f.id}
                  loading={loadingHistory}
                  total={history?.length}
                  page={historyPage}
                  pageSize={HISTORY_PAGE_SIZE}
                  onPageChange={setHistoryPage}
                />
              </div>
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
            <div className="p-2">
              <DataTable columns={movementColumns} rows={movements} rowKey={(m) => m.id} />
            </div>
          )}
        </div>
      </div>
      </div>

      {reversingTarget && (
        <ReverseFloatMovementModal
          movement={reversingTarget}
          loading={reversingMovement}
          onClose={() => setReversingTarget(null)}
          onConfirm={(reason) => handleReverseMovement(reversingTarget.id, reason)}
        />
      )}
    </PortalPage>
  )
}

// ─── Reverse Float Movement Modal ──────────────────────────────────────────────

function ReverseFloatMovementModal({
  movement, loading, onClose, onConfirm,
}: {
  movement: FloatMovement
  loading: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const { symbol: currSym } = useSystemCurrency()

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Reverse Float Movement" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 12px' }}>
            You are about to reverse a <span style={{ fontWeight: 600, color: colors.textPrimary }}>{movement.movementType}</span> of{' '}
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>{currSym} {new Decimal(movement.amount).toFixed(2)}</span>.
            This action cannot be undone.
          </p>
          <span style={lbl}>Reason for reversal</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason (min 5 characters)"
            style={inp}
            disabled={loading}
          />
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={() => onConfirm(reason)} disabled={reason.trim().length < 5} loading={loading}>
            Confirm Reversal
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
