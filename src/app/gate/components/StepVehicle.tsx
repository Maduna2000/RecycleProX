'use client'

import { useState } from 'react'
import { Truck, ArrowRight } from 'lucide-react'

interface Props {
  onNext: (vehicleReg: string) => void
}

export default function StepVehicle({ onNext }: Props) {
  const [reg, setReg] = useState('')

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 gap-5">
      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-50 rounded-2xl flex items-center justify-center">
        <Truck className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600" />
      </div>
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Vehicle Registration</h2>
        <p className="text-slate-500 mt-1">Enter the vehicle&apos;s number plate, if applicable</p>
      </div>

      <div className="w-full max-w-sm sm:max-w-md flex flex-col gap-4">
        <input
          value={reg}
          onChange={(e) => setReg(e.target.value.toUpperCase())}
          className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg text-center font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
          placeholder="SD 123 AB"
          autoFocus
        />
        <button
          onClick={() => onNext(reg.trim())}
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xl font-semibold h-16 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
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
