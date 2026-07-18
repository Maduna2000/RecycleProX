'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import type { VisitorInfo } from './StepVisitor'
import type { Purpose } from './StepPurpose'
import type { PhotoKeys } from './StepPhotos'

interface Props {
  visitor:      VisitorInfo
  purpose:      Purpose
  categoryName: string | null
  vehicleReg:   string
  photoKeys:    PhotoKeys
  onSubmitted:  () => void
}

const PURPOSE_LABELS: Record<Purpose, string> = {
  sell: 'To Sell', buy: 'To Buy', visitor: 'Visitor', other: 'Other',
}

export default function StepReview({ visitor, purpose, categoryName, vehicleReg, photoKeys, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ entryNumber: string } | null>(null)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/gate/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          categoryName:     categoryName ?? undefined,
          visitorFirstName: visitor.firstName,
          visitorLastName:  visitor.lastName,
          visitorIdNumber:  visitor.idNumber,
          visitorPhone:     visitor.phone,
          vehicleReg:       vehicleReg || undefined,
          ...photoKeys,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to register entry')
      }
      const entry = await res.json()
      setDone({ entryNumber: entry.entryNumber })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register entry')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Entry Registered</h2>
        <p className="text-slate-500 font-mono">{done.entryNumber}</p>
        <button
          onClick={onSubmitted}
          className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold h-14 px-8 rounded-xl transition-colors"
        >
          New Entry
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Review</h2>
      <p className="text-slate-500 mb-5">Confirm the details before registering</p>

      <div className="bg-white rounded-2xl shadow-md p-5 flex flex-col gap-3 mb-6">
        <Row label="Visitor" value={`${visitor.firstName} ${visitor.lastName}`} />
        <Row label="ID Number" value={visitor.idNumber} />
        {visitor.phone && <Row label="Phone" value={visitor.phone} />}
        <Row label="Purpose" value={PURPOSE_LABELS[purpose]} />
        {categoryName && <Row label="Category" value={categoryName} />}
        {vehicleReg && <Row label="Vehicle Reg" value={vehicleReg} />}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xl font-semibold h-16 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Registering…</> : 'Register Entry'}
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  )
}
