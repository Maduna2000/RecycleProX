'use client'

import { useState, useEffect } from 'react'
import * as LucideIcons from 'lucide-react'
import { Package, Loader2, ArrowRight, Recycle, Check } from 'lucide-react'

type SellOption = {
  id: string
  label: string
  colorHex: string | null
  iconName: string | null
}

interface Props {
  onSelect: (categoryNames: string[]) => void
}

function CatIcon({ name, size = 22 }: { name: string | null; size?: number }) {
  if (!name) return <Package style={{ width: size, height: size }} />
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ style?: React.CSSProperties }>>)[name]
  return Icon ? <Icon style={{ width: size, height: size }} /> : <Package style={{ width: size, height: size }} />
}

export default function StepCategory({ onSelect }: Props) {
  const [options, setOptions] = useState<SellOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/gate/sell-options')
      .then((r) => r.json())
      .then((d) => setOptions(d.options ?? []))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [])

  function toggle(label: string) {
    setSelected((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label])
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 max-w-2xl lg:max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <Recycle className="w-5 h-5 text-emerald-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">What are they selling?</h2>
      </div>
      <p className="text-slate-500 mb-5 sm:mb-6">Select one or more options</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {options.map((opt) => {
          const isSel = selected.includes(opt.label)
          const bg = opt.colorHex ? `${opt.colorHex}22` : '#F1F5F9'
          const fg = opt.colorHex ?? '#475569'
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.label)}
              className="relative flex flex-col items-center gap-2 rounded-2xl shadow-sm hover:shadow-md p-4 border-2 transition-all active:scale-95 bg-white min-h-[96px] justify-center"
              style={{ borderColor: isSel ? '#10b981' : '#F1F5F9' }}
            >
              {isSel && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: bg, color: fg }}>
                <CatIcon name={opt.iconName} />
              </div>
              <span className="font-medium text-slate-800 text-sm text-center leading-tight">{opt.label}</span>
            </button>
          )
        })}
        {options.length === 0 && (
          <p className="col-span-full text-center text-slate-400 py-8">No sell categories configured yet</p>
        )}
      </div>

      <button
        onClick={() => selected.length > 0 && onSelect(selected)}
        disabled={selected.length === 0}
        className="mt-6 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 text-white text-xl font-semibold h-16 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
      >
        Continue <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  )
}
