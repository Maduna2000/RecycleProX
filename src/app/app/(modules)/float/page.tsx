'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SetFloatSchema, type SetFloatFormInput, type SetFloatInput } from '@/lib/schemas/float'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, Calendar, PlusCircle, Settings2, Undo2, ChevronLeft, ChevronRight } from 'lucide-react'
import Decimal from 'decimal.js'
import { PageShell } from '@/components/layout/PageShell'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { colors } from '@/lib/design-tokens'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'
import { offlineDB } from '@/lib/offline/db'
import { z } from 'zod'

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

function todayISO() {
  return new Date().toISOString().split('T')[0]!
}

export default function FloatPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const { mutate: offlineMutate } = useOfflineMutation()

  const { data: todayData, isLoading: loadingToday } = useSWR<TodayFloatResponse>('/api/float/today', fetcher)
  const { data: history, isLoading: loadingHistory } = useSWR<CashFloat[]>('/api/float', fetcher)
  const { data: currentData, mutate: mutateCurrentFloat } = useSWR<CurrentFloatResponse>('/api/float/current', fetcher, { refreshInterval: 30000 })
  const [saving, setSaving] = useState(false)
  const [showCorrectForm, setShowCorrectForm] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<CashFloat | null>(null)
  const [reversing, setReversing] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 10

  const todayFloat      = todayData?.today ?? null
  const suggestedAmount = todayData?.suggestedAmount ?? null
  const suggestedDate   = todayData?.suggestedDate ?? null
  const movements       = currentData?.float?.movements ?? []
  const currentBalance  = currentData?.float?.currentBalance ?? null

  // ── Opening float form (first-time set or correction) ──────────────────────
  const openingForm = useForm<SetFloatFormInput, unknown, SetFloatInput>({
    resolver: zodResolver(SetFloatSchema),
    defaultValues: { floatDate: todayISO(), openingAmount: '' },
  })

  // ── Top-up form (add to existing balance) ──────────────────────────────────
  const topUpForm = useForm<TopUpFormValues>({
    resolver: zodResolver(TopUpFormSchema),
    defaultValues: { amount: '', note: '' },
  })

  async function onSetOpening(data: SetFloatInput) {
    const localId = `local_${crypto.randomUUID()}`
    setSaving(true)
    try {
      const { queued } = await offlineMutate({ method: 'POST', url: '/api/float', body: data, localId })
      if (queued) {
        await offlineDB.cashFloats.put({
          id: localId,
          floatDate: data.floatDate,
          openingAmount: String(data.openingAmount),
          notes: data.notes || undefined,
          createdByUserId: session?.user?.id,
          createdAt: new Date().toISOString(),
          _offlineCreated: true,
        })
        toast.success('Float saved offline — will sync when connected')
      } else {
        toast.success('Opening float saved')
        mutate('/api/float/today')
        mutate('/api/float')
        mutateCurrentFloat()
        setShowCorrectForm(false)
      }
      openingForm.reset({ floatDate: todayISO(), openingAmount: '' })
    } catch {
      toast.error('Failed to save float')
    } finally {
      setSaving(false)
    }
  }

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
      mutate('/api/float/today')
      mutate('/api/float')
      mutateCurrentFloat()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to top up float')
    } finally {
      setSaving(false)
    }
  }

  async function handleReverse() {
    if (!reverseTarget) return
    setReversing(true)
    try {
      const res = await fetch(`/api/float/${reverseTarget.id}/reverse`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Reversal failed')
      }
      toast.success('Float entry reversed')
      mutate('/api/float')
      mutate('/api/float/today')
      mutateCurrentFloat()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reverse float')
    } finally {
      setReversing(false)
      setReverseTarget(null)
    }
  }

  const floatAlreadySet = !!todayFloat

  return (
    <PageShell title="Float" subtitle="Opening cash float">
      <div className="max-w-3xl mx-auto w-full space-y-5 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Today's float status + action forms */}
          <div className="rounded border p-5 space-y-4 bg-white" style={{ borderColor: colors.border }}>
            <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Today&apos;s Float</h2>

            {loadingToday ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : floatAlreadySet ? (
              <div className="space-y-3">
                {/* Current balance card */}
                <div className="px-4 py-3 rounded" style={{ background: colors.warningBg, border: `1px solid ${colors.warning}40` }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.warning }}>Opening Float</p>
                  <p className="font-mono font-bold mt-1" style={{ fontSize: 24, color: '#92700F' }}>
                    R {new Decimal(todayFloat.openingAmount).toFixed(2)}
                  </p>
                  {currentBalance && new Decimal(currentBalance).gt(new Decimal(todayFloat.openingAmount)) && (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide mt-2" style={{ color: colors.action }}>Current Balance (after top-ups)</p>
                      <p className="font-mono font-bold" style={{ fontSize: 20, color: colors.action }}>
                        R {new Decimal(currentBalance).toFixed(2)}
                      </p>
                    </>
                  )}
                  <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    {new Date(todayFloat.floatDate).toLocaleDateString('en-ZA', { dateStyle: 'full' })}
                  </p>
                  {todayFloat.notes && <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>{todayFloat.notes}</p>}
                </div>

                {/* Top-up form */}
                {isManager && (
                  <div className="rounded p-4 space-y-3" style={{ background: colors.actionBg, border: `1px solid ${colors.action}30` }}>
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
                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          width: '100%',
                          fontSize: 10,
                          padding: '1px 6px',
                          background: '#E0E0E0',
                          border: '1px solid #999',
                          borderRadius: 2,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          opacity: saving ? 0.6 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 3,
                          color: '#212529',
                        }}
                        onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#D0D0D0' }}
                        onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#E0E0E0' }}
                      >
                        {saving ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Adding…</> : 'Add to Float'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Correct opening amount (collapsible) */}
                {isManager && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs"
                      style={{ color: colors.textSecondary }}
                      onClick={() => setShowCorrectForm(v => !v)}
                    >
                      <Settings2 className="w-3 h-3" />
                      {showCorrectForm ? 'Hide correction' : 'Correct opening amount'}
                    </button>
                    {showCorrectForm && (
                      <form onSubmit={openingForm.handleSubmit(onSetOpening)} className="mt-2 space-y-2 p-3 rounded" style={{ background: '#FFF8E1', border: `1px solid ${colors.warning}40` }}>
                        <p className="text-xs" style={{ color: colors.warning }}>This replaces today&apos;s opening amount. Use only to fix an entry error.</p>
                        <div>
                          <Label className="text-xs" style={{ color: colors.textSecondary }}>Corrected Opening Amount (R)</Label>
                          <Input
                            {...openingForm.register('openingAmount')}
                            type="number"
                            step="0.01"
                            min="0"
                            className="mt-1 h-8 text-xs font-mono border-[#E0E0E0]"
                            disabled={saving}
                            placeholder="0.00"
                          />
                          <input type="hidden" {...openingForm.register('floatDate')} value={todayISO()} />
                        </div>
                        <button
                          type="submit"
                          disabled={saving}
                          style={{
                            width: '100%',
                            fontSize: 10,
                            padding: '1px 6px',
                            background: '#E0E0E0',
                            border: '1px solid #999',
                            borderRadius: 2,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            color: '#212529',
                          }}
                          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#D0D0D0' }}
                          onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#E0E0E0' }}
                        >
                          {saving ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Correct Opening Amount'}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="py-6 rounded text-center text-sm" style={{ background: colors.toolbar, border: `1px dashed ${colors.border}`, color: colors.textSecondary }}>
                  No float set for today yet
                </div>
                {suggestedAmount && (
                  <div className="rounded px-4 py-3" style={{ background: colors.processBg, border: `1px solid ${colors.process}30` }}>
                    <p className="text-xs font-semibold" style={{ color: colors.process }}>Carry-Forward Available</p>
                    <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                      Previous closing: <span className="font-mono font-semibold" style={{ color: colors.textPrimary }}>R {new Decimal(suggestedAmount).toFixed(2)}</span>
                      {suggestedDate && (
                        <> · {new Date(suggestedDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</>
                      )}
                    </p>
                    {isManager && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium underline"
                        style={{ color: colors.process }}
                        onClick={() => openingForm.setValue('openingAmount', new Decimal(suggestedAmount).toFixed(2))}
                      >
                        Use this amount →
                      </button>
                    )}
                  </div>
                )}

                {isManager && (
                  <form onSubmit={openingForm.handleSubmit(onSetOpening)} className="space-y-3 pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>Set Opening Float</p>
                    <div>
                      <Label className="text-xs" style={{ color: colors.textSecondary }}>Date</Label>
                      <Input {...openingForm.register('floatDate')} type="date" className="mt-1 h-8 text-xs border-[#E0E0E0]" disabled={saving} />
                    </div>
                    <div>
                      <Label className="text-xs" style={{ color: colors.textSecondary }}>Opening Amount (R)</Label>
                      <Input
                        {...openingForm.register('openingAmount')}
                        type="number"
                        step="0.01"
                        min="0"
                        className="mt-1 h-8 text-xs font-mono border-[#E0E0E0]"
                        disabled={saving}
                        placeholder="0.00"
                      />
                      {openingForm.formState.errors.openingAmount && (
                        <p className="text-xs mt-1" style={{ color: colors.danger }}>{openingForm.formState.errors.openingAmount.message}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs" style={{ color: colors.textSecondary }}>Notes (optional)</Label>
                      <Input {...openingForm.register('notes')} className="mt-1 h-8 text-xs border-[#E0E0E0]" disabled={saving} placeholder="e.g. Taken from safe" />
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        width: '100%',
                        fontSize: 10,
                        padding: '1px 6px',
                        background: '#E0E0E0',
                        border: '1px solid #999',
                        borderRadius: 2,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                        color: '#212529',
                      }}
                      onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#D0D0D0' }}
                      onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#E0E0E0' }}
                    >
                      {saving ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Set Opening Float'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* History */}
          <div className="rounded border bg-white" style={{ borderColor: colors.border }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Float History</h2>
              </div>
              {isManager && history?.some(f => f.isLastEntry && f.canReverse) && (
                <button
                  type="button"
                  onClick={() => {
                    const lastFloat = history?.find(f => f.isLastEntry && f.canReverse)
                    if (lastFloat) setReverseTarget(lastFloat)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '1px 6px',
                    fontSize: 10,
                    background: '#E0E0E0',
                    border: '1px solid #999',
                    borderRadius: 2,
                    color: '#212529',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
                >
                  <Undo2 style={{ width: 10, height: 10 }} />
                  Reverse Last Float
                </button>
              )}
            </div>

            {loadingHistory ? (
              <div className="flex items-center gap-2 text-sm p-5" style={{ color: colors.textSecondary }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : !history?.length ? (
              <div className="text-center py-8 text-sm" style={{ color: colors.textSecondary }}>No float history</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F5F5F5', borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                        <th style={{ textAlign: 'right', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opening Float</th>
                        <th style={{ textAlign: 'right', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Float</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((f, i) => (
                        <tr key={f.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: `1px solid #F0F0F0` }}>
                          <td style={{ padding: '8px 12px' }}>
                            <p className="text-xs font-medium" style={{ color: colors.textPrimary }}>
                              {new Date(f.floatDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            {f.notes && <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{f.notes}</p>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <span className="font-mono font-semibold text-xs" style={{ color: colors.textPrimary }}>
                              R {new Decimal(f.openingAmount).toFixed(2)}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <span className="font-mono font-semibold text-xs" style={{ color: f.closingAmount ? colors.textSecondary : colors.action }}>
                              R {new Decimal(f.currentBalance).toFixed(2)}
                            </span>
                            {f.closingAmount && (
                              <span className="text-xs ml-1" style={{ color: colors.textSecondary }}>(closed)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {history.length > HISTORY_PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                      Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPage * HISTORY_PAGE_SIZE, history.length)} of {history.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage(p => p - 1)}
                        style={{
                          padding: '2px 6px',
                          fontSize: 10,
                          background: '#E0E0E0',
                          border: '1px solid #999',
                          borderRadius: 2,
                          cursor: historyPage <= 1 ? 'not-allowed' : 'pointer',
                          opacity: historyPage <= 1 ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { if (historyPage > 1) e.currentTarget.style.background = '#D0D0D0' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
                      >
                        <ChevronLeft style={{ width: 12, height: 12 }} />
                      </button>
                      <span className="text-xs px-2" style={{ color: colors.textPrimary }}>
                        Page {historyPage} of {Math.ceil(history.length / HISTORY_PAGE_SIZE)}
                      </span>
                      <button
                        type="button"
                        disabled={historyPage >= Math.ceil(history.length / HISTORY_PAGE_SIZE)}
                        onClick={() => setHistoryPage(p => p + 1)}
                        style={{
                          padding: '2px 6px',
                          fontSize: 10,
                          background: '#E0E0E0',
                          border: '1px solid #999',
                          borderRadius: 2,
                          cursor: historyPage >= Math.ceil(history.length / HISTORY_PAGE_SIZE) ? 'not-allowed' : 'pointer',
                          opacity: historyPage >= Math.ceil(history.length / HISTORY_PAGE_SIZE) ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { if (historyPage < Math.ceil(history.length / HISTORY_PAGE_SIZE)) e.currentTarget.style.background = '#D0D0D0' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
                      >
                        <ChevronRight style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Today's Movements */}
        {movements.length > 0 && (
          <div className="rounded border bg-white" style={{ borderColor: colors.border }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
              <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Today&apos;s Float Movements</h2>
              <span className="text-xs" style={{ color: colors.textSecondary }}>{movements.length} movement{movements.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F5F5F5', borderBottom: `1px solid ${colors.border}` }}>
                    {['Time', 'Type', 'Amount', 'Balance After', 'Note'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, i) => (
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
                      <td style={{ padding: '6px 12px', fontSize: 12, fontFamily: 'monospace', color: colors.textPrimary }}>
                        R {new Decimal(m.balanceAfter).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 12px', fontSize: 11, color: colors.textSecondary }}>
                        {m.referenceNote ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

        {/* Reverse Float Confirmation Dialog */}
        <ConfirmDialog
          open={!!reverseTarget}
          onOpenChange={(open) => { if (!open) setReverseTarget(null) }}
          title="Reverse Float Entry?"
          message={reverseTarget
            ? `This will permanently delete the float entry for ${new Date(reverseTarget.floatDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} with opening amount R ${new Decimal(reverseTarget.openingAmount).toFixed(2)}. This action cannot be undone.`
            : ''
          }
          variant="danger"
          confirmLabel={reversing ? 'Reversing…' : 'Reverse Entry'}
          onConfirm={handleReverse}
        />
    </PageShell>
  )
}
