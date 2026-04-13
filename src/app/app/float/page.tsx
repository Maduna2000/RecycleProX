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
import { Loader2, Calendar } from 'lucide-react'
import Decimal from 'decimal.js'
import { PageShell } from '@/components/layout/PageShell'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type CashFloat = {
  id: string
  floatDate: string
  openingAmount: string
  closingAmount?: string | null
  notes?: string | null
  createdAt: string
}

function todayISO() {
  return new Date().toISOString().split('T')[0]!
}

export default function FloatPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: todayFloat, isLoading: loadingToday } = useSWR<CashFloat | null>('/api/float/today', fetcher)
  const { data: history, isLoading: loadingHistory } = useSWR<CashFloat[]>('/api/float', fetcher)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SetFloatFormInput, unknown, SetFloatInput>({
    resolver: zodResolver(SetFloatSchema),
    defaultValues: { floatDate: todayISO(), openingAmount: '' },
  })

  async function onSubmit(data: SetFloatInput) {
    setSaving(true)
    const res = await fetch('/api/float', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Float saved')
      mutate('/api/float/today')
      mutate('/api/float')
      reset({ floatDate: todayISO(), openingAmount: '' })
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to save float')
    }
  }

  return (
    <PageShell title="Float" subtitle="Opening cash float">
      <div className="max-w-3xl space-y-5 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Today's float */}
          <div className="rounded-lg border p-5 space-y-4 bg-white" style={{ borderColor: colors.border }}>
            <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Today&apos;s Float</h2>

            {loadingToday ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : todayFloat ? (
              <div className="px-4 py-3 rounded-lg" style={{ background: colors.warningBg, border: `1px solid ${colors.warning}40` }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.warning }}>Opening Float Set</p>
                <p className="font-mono font-bold mt-1" style={{ fontSize: 24, color: '#92700F' }}>
                  R {new Decimal(todayFloat.openingAmount).toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                  {new Date(todayFloat.floatDate).toLocaleDateString('en-ZA', { dateStyle: 'full' })}
                </p>
                {todayFloat.notes && <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>{todayFloat.notes}</p>}
                {isManager && (
                  <p className="text-xs mt-2" style={{ color: colors.warning }}>Submit the form below to update today&apos;s float.</p>
                )}
              </div>
            ) : (
              <div className="py-6 rounded-lg text-center text-sm" style={{ background: colors.toolbar, border: `1px dashed ${colors.border}`, color: colors.textSecondary }}>
                No float set for today yet
              </div>
            )}

            {isManager && (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>Set / Update Float</p>
                <div>
                  <Label className="text-xs" style={{ color: colors.textSecondary }}>Date</Label>
                  <Input {...register('floatDate')} type="date" className="mt-1 h-8 text-xs border-[#E0E0E0]" disabled={saving} />
                  {errors.floatDate && <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.floatDate.message}</p>}
                </div>
                <div>
                  <Label className="text-xs" style={{ color: colors.textSecondary }}>Opening Amount (R)</Label>
                  <Input {...register('openingAmount')} type="number" step="0.01" min="0" className="mt-1 h-8 text-xs font-mono border-[#E0E0E0]" disabled={saving} placeholder="0.00" />
                  {errors.openingAmount && <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.openingAmount.message}</p>}
                </div>
                <div>
                  <Label className="text-xs" style={{ color: colors.textSecondary }}>Notes (optional)</Label>
                  <Input {...register('notes')} className="mt-1 h-8 text-xs border-[#E0E0E0]" disabled={saving} placeholder="e.g. Taken from safe" />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: colors.action }}
                >
                  {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Save Float'}
                </button>
              </form>
            )}
          </div>

          {/* History */}
          <div className="rounded-lg border p-5 bg-white" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4" style={{ color: colors.textSecondary }} />
              <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Float History</h2>
              <span className="text-xs ml-1" style={{ color: colors.textSecondary }}>(last 30 days)</span>
            </div>

            {loadingHistory ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : !history?.length ? (
              <div className="text-center py-8 text-sm" style={{ color: colors.textSecondary }}>No float history</div>
            ) : (
              <div className="space-y-0 overflow-y-auto max-h-96">
                {history.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < history.length - 1 ? `1px solid ${colors.bg}` : 'none' }}>
                    <div>
                      <p className="text-xs font-medium" style={{ color: colors.textPrimary }}>
                        {new Date(f.floatDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {f.notes && <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{f.notes}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold text-xs" style={{ color: colors.textPrimary }}>R {new Decimal(f.openingAmount).toFixed(2)}</p>
                      {f.closingAmount && (
                        <p className="font-mono text-xs mt-0.5" style={{ color: colors.textSecondary }}>Close: R {new Decimal(f.closingAmount).toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
