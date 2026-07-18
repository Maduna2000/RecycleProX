'use client'

import { useState } from 'react'
import { Truck, ArrowRight } from 'lucide-react'

interface Props {
  onNext: (vehicleReg: string) => void
}

export default function StepVehicle({ onNext }: Props) {
  const [reg, setReg] = useState('')

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
        <Truck className="w-8 h-8 text-blue-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 text-center">Vehicle Registration</h2>
      <p className="text-slate-500 text-center">Enter the vehicle&apos;s number plate, if applicable</p>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <input
          value={reg}
          onChange={(e) => setReg(e.target.value.toUpperCase())}
          className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg text-center font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="SD 123 AB"
          autoFocus
        />
        <button
          onClick={() => onNext(reg.trim())}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xl font-semibold h-16 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          Continue <ArrowRight className="w-5 h-5" />
        </button>
        {!reg.trim() && (
          <p className="text-center text-slate-400 text-xs">No vehicle? Leave blank and continue.</p>
        )}
      </div>
    </div>
  )
}
