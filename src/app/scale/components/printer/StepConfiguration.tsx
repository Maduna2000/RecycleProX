'use client'

import { useState } from 'react'
import { Printer, FileText, Scissors, Sun } from 'lucide-react'
import { PaperWidth, ConnectionType, CreatePrinterConfig } from '@/lib/schemas/printer'

interface Props {
  address: string
  deviceType: 'classic' | 'ble'
  connectionType: ConnectionType
  onSave: (config: CreatePrinterConfig) => void
  onBack: () => void
}

export default function StepConfiguration({
  address,
  deviceType,
  connectionType,
  onSave,
  onBack,
}: Props) {
  const [label, setLabel] = useState('')
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('58mm')
  const [density, setDensity] = useState(4)
  const [autoCut, setAutoCut] = useState(true)

  function handleSave() {
    // Map 'classic' device type to 'bluetooth' connection type
    const connType: ConnectionType = connectionType === 'network'
      ? 'network'
      : deviceType === 'ble' ? 'ble' : 'bluetooth'

    const config: CreatePrinterConfig = {
      label: label.trim() || `Printer ${address.slice(-5)}`,
      connectionType: connType,
      address,
      paperWidth,
      density,
      autoCut,
      isDefault: true,
    }
    onSave(config)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-slate-800">Configure Printer</h3>
        <p className="text-sm text-slate-500 mt-1">Set up your printer preferences</p>
      </div>

      {/* Printer Info */}
      <div className="bg-emerald-50 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <Printer className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-emerald-800">Selected Printer</p>
          <p className="text-xs text-emerald-600 font-mono truncate">{address}</p>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="space-y-4">
        {/* Printer Label */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Printer Name (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g., Front Counter"
            maxLength={32}
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-400 focus:outline-none"
          />
        </div>

        {/* Paper Width */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            Paper Width
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(['58mm', '80mm'] as PaperWidth[]).map(width => (
              <button
                key={width}
                onClick={() => setPaperWidth(width)}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  paperWidth === width
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="font-bold text-lg">{width}</p>
                <p className="text-xs text-slate-500">{width === '58mm' ? '32 chars/line' : '48 chars/line'}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Print Density */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <Sun className="w-4 h-4 text-slate-500" />
            Print Density: {density}
          </label>
          <input
            type="range"
            min="0"
            max="7"
            value={density}
            onChange={e => setDensity(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Lighter</span>
            <span>Darker</span>
          </div>
        </div>

        {/* Auto-Cut */}
        <div className="flex items-center justify-between p-4 rounded-xl border-2 border-slate-200">
          <div className="flex items-center gap-3">
            <Scissors className="w-5 h-5 text-slate-500" />
            <div>
              <p className="font-medium text-slate-700">Auto-Cut Paper</p>
              <p className="text-xs text-slate-400">Automatically cut after each print</p>
            </div>
          </div>
          <button
            onClick={() => setAutoCut(!autoCut)}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              autoCut ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                autoCut ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
