'use client'

import { Bluetooth, Wifi } from 'lucide-react'
import { ConnectionType } from '@/lib/schemas/printer'

interface Props {
  onSelect: (type: ConnectionType) => void
}

export default function StepConnectionType({ onSelect }: Props) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-slate-800">How is your printer connected?</h3>
        <p className="text-sm text-slate-500 mt-1">Choose the connection method for your thermal printer</p>
      </div>

      <button
        onClick={() => onSelect('bluetooth')}
        className="flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-[0.98]"
      >
        <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <Bluetooth className="w-7 h-7 text-blue-600" />
        </div>
        <div className="text-left">
          <p className="font-semibold text-slate-800">Bluetooth</p>
          <p className="text-sm text-slate-500">Classic Bluetooth or BLE printer</p>
        </div>
      </button>

      <button
        onClick={() => onSelect('network')}
        className="flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50 transition-all active:scale-[0.98]"
      >
        <div className="w-14 h-14 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <Wifi className="w-7 h-7 text-emerald-600" />
        </div>
        <div className="text-left">
          <p className="font-semibold text-slate-800">Network / Ethernet</p>
          <p className="text-sm text-slate-500">IP-connected printer (WiFi or cable)</p>
        </div>
      </button>
    </div>
  )
}
