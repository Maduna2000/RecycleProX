'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  unit: string
  onConfirm: (weight: string) => void
}

export default function Step3Weight({ unit, onConfirm }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (/^\d*\.?\d{0,3}$/.test(v)) {
      setValue(v)
      setError('')
    }
  }

  function handleConfirm() {
    const num = parseFloat(value)
    if (!value || isNaN(num) || num <= 0) {
      setError('Please enter a valid weight greater than 0')
      return
    }
    onConfirm(value)
  }

  const numVal  = parseFloat(value)
  const isValid = !!value && !isNaN(numVal) && numVal > 0

  const borderCls = error
    ? 'border-red-400 focus:border-red-500'
    : isValid
      ? 'border-emerald-500 focus:border-emerald-500'
      : 'border-slate-300 focus:border-emerald-500'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1 text-center">Enter Weight</h2>
      <p className="text-slate-500 mb-8 text-center">Enter the scale reading in {unit}</p>

      <div className="w-full relative mb-2">
        <input
          type="number"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={handleChange}
          placeholder="0.000"
          autoFocus
          className={`w-full border-2 rounded-2xl py-5 text-4xl md:text-6xl font-bold text-center text-slate-800 focus:outline-none transition-colors ${value ? 'pl-12 pr-24' : 'px-5 pr-24'} ${borderCls}`}
        />

        {/* Clear button — appears when value is non-empty */}
        {value && (
          <button
            type="button"
            onClick={() => { setValue(''); setError('') }}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors"
            aria-label="Clear weight"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Unit badge */}
        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">
          {unit}
        </span>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button
        onClick={handleConfirm}
        disabled={!value}
        className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xl font-semibold h-16 rounded-xl transition-colors"
      >
        Continue →
      </button>
    </div>
  )
}
