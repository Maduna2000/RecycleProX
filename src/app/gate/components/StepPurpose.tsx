'use client'

import { Recycle, ShoppingCart, User, MoreHorizontal, ArrowRight } from 'lucide-react'

export type Purpose = 'sell' | 'buy' | 'visitor' | 'other'

const PURPOSES: { value: Purpose; label: string; description: string; icon: typeof Recycle; iconBg: string; iconColor: string }[] = [
  { value: 'sell',    label: 'To Sell',  description: 'Bringing scrap/recyclables to sell', icon: Recycle,       iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
  { value: 'buy',     label: 'To Buy',   description: 'Buying recyclables from us',          icon: ShoppingCart,  iconBg: 'bg-blue-100',    iconColor: 'text-blue-600' },
  { value: 'visitor', label: 'Visitor',  description: 'General visit',                        icon: User,          iconBg: 'bg-purple-100',  iconColor: 'text-purple-600' },
  { value: 'other',   label: 'Other',    description: 'Delivery, contractor, etc.',           icon: MoreHorizontal, iconBg: 'bg-slate-200',   iconColor: 'text-slate-600' },
]

interface Props {
  onSelect: (purpose: Purpose) => void
}

export default function StepPurpose({ onSelect }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
      <h2 className="text-2xl font-bold text-slate-800 text-center">Reason for Entry</h2>
      <p className="text-slate-500 text-center">Why is this visitor entering the yard?</p>

      <div className="w-full max-w-sm flex flex-col gap-3 mt-2">
        {PURPOSES.map((p) => {
          const Icon = p.icon
          return (
            <button
              key={p.value}
              onClick={() => onSelect(p.value)}
              className="flex items-center gap-4 bg-white rounded-2xl shadow-md p-5 border-2 border-transparent hover:border-emerald-500 active:scale-95 transition-all text-left"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${p.iconBg}`}>
                <Icon className={`w-6 h-6 ${p.iconColor}`} />
              </div>
              <div>
                <div className="font-semibold text-slate-800 text-lg">{p.label}</div>
                <div className="text-slate-500 text-sm">{p.description}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 ml-auto" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
