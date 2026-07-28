'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react'
import type { VisitorInfo } from './StepVisitor'
import type { Purpose } from './StepPurpose'
import type { PhotoKeys } from './StepPhotos'

interface Props {
  visitor:       VisitorInfo
  purpose:       Purpose
  categoryNames: string[]
  vehicleReg:    string
  photoKeys:     PhotoKeys
  onSubmitted:   () => void
}

const PURPOSE_LABELS: Record<Purpose, string> = {
  sell: 'To Sell', buy: 'To Buy', visitor: 'Visitor', other: 'Other',
}

export default function StepReview({ visitor, purpose, categoryNames, vehicleReg, photoKeys, onSubmitted }: Props) {
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
          categoryNames:    categoryNames.length > 0 ? categoryNames : undefined,
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
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 sm:w-14 sm:h-14 text-emerald-600" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Entry Registered</h2>
        <p className="font-mono text-base sm:text-lg font-semibold text-blue-700 bg-blue-50 px-4 py-1.5 rounded-full">{done.entryNumber}</p>
        <button
          onClick={onSubmitted}
          className="mt-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-lg font-semibold h-14 px-8 rounded-xl transition-colors shadow-md shadow-blue-600/20"
        >
          New Entry
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 max-w-lg sm:max-w-xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <ClipboardCheck className="w-5 h-5 text-blue-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Review</h2>
      </div>
      <p className="text-slate-500 mb-5 sm:mb-6">Confirm the details before registering</p>

      <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3 mb-6 divide-y divide-slate-100">
        <Row label="Visitor" value={`${visitor.firstName} ${visitor.lastName}`} />
        <Row label="ID Number" value={visitor.idNumber} pad />
        {visitor.phone && <Row label="Phone" value={visitor.phone} pad />}
        <Row label="Purpose" value={PURPOSE_LABELS[purpose]} pad />
        {categoryNames.length > 0 && <Row label="Category" value={categoryNames.join(', ')} pad />}
        {vehicleReg && <Row label="Vehicle Reg" value={vehicleReg} pad />}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 mb-4">
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xl font-semibold h-16 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
      >
        {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Registering…</> : 'Register Entry'}
      </button>
    </div>
  )
}

function Row({ label, value, pad }: { label: string; value: string; pad?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${pad ? 'pt-3' : ''}`}>
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="font-semibold text-slate-800 text-right">{value}</span>
    </div>
  )
}
