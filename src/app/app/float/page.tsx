'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SetFloatSchema, type SetFloatFormInput, type SetFloatInput } from '@/lib/schemas/float'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Coins, Loader2, Calendar } from 'lucide-react'

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
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
          <Coins className="w-5 h-5 text-yellow-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Float</h1>
          <p className="text-sm text-gray-500">Daily opening float management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today's float */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Today&apos;s Float</h2>

          {loadingToday ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : todayFloat ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-600 font-semibold uppercase tracking-wide">Opening Float Set</p>
              <p className="text-3xl font-bold text-yellow-800 mt-1">
                R {parseFloat(todayFloat.openingAmount).toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {new Date(todayFloat.floatDate).toLocaleDateString('en-ZA', { dateStyle: 'full' })}
              </p>
              {todayFloat.notes && <p className="text-xs text-gray-500 mt-1">{todayFloat.notes}</p>}
              {isManager && (
                <p className="text-xs text-yellow-600 mt-2">Submit the form below to update today&apos;s float.</p>
              )}
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-center text-gray-400 text-sm">
              No float set for today yet
            </div>
          )}

          {isManager && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 pt-2 border-t">
              <p className="text-sm font-medium text-gray-700">Set / Update Float</p>
              <div>
                <Label>Date</Label>
                <Input {...register('floatDate')} type="date" className="mt-1" disabled={saving} />
                {errors.floatDate && <p className="text-xs text-red-600 mt-1">{errors.floatDate.message}</p>}
              </div>
              <div>
                <Label>Opening Amount (R)</Label>
                <Input {...register('openingAmount')} type="number" step="0.01" min="0" className="mt-1" disabled={saving} placeholder="0.00" />
                {errors.openingAmount && <p className="text-xs text-red-600 mt-1">{errors.openingAmount.message}</p>}
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input {...register('notes')} className="mt-1" disabled={saving} placeholder="e.g. Taken from safe" />
              </div>
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Float'}
              </Button>
            </form>
          )}
        </div>

        {/* History */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Float History</h2>
            <span className="text-xs text-gray-400">(last 30 days)</span>
          </div>

          {loadingHistory ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : !history?.length ? (
            <div className="text-center py-8 text-gray-400 text-sm">No float history</div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-96">
              {history.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {new Date(f.floatDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {f.notes && <p className="text-xs text-gray-400">{f.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">R {parseFloat(f.openingAmount).toFixed(2)}</p>
                    {f.closingAmount && (
                      <p className="text-xs text-gray-400">Close: R {parseFloat(f.closingAmount).toFixed(2)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
