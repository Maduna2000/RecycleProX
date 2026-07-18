'use client'

import { Recycle, ShoppingCart, User, MoreHorizontal, ArrowRight } from 'lucide-react'

export type Purpose = 'sell' | 'buy' | 'visitor' | 'other'

const PURPOSES: { value: Purpose; label: string; description: string; icon: typeof Recycle; iconBg: string; iconColor: string; ring: string }[] = [
  { value: 'sell',    label: 'To Sell',  description: 'Bringing scrap/recyclables to sell', icon: Recycle,        iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', ring: 'hover:border-emerald-400' },
  { value: 'buy',     label: 'To Buy',   description: 'Buying recyclables from us',          icon: ShoppingCart,  iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    ring: 'hover:border-blue-400' },
  { value: 'visitor', label: 'Visitor',  description: 'General visit',                        icon: User,          iconBg: 'bg-violet-50',  iconColor: 'text-violet-600',  ring: 'hover:border-violet-400' },
  { value: 'other',   label: 'Other',    description: 'Delivery, contractor, etc.',           icon: MoreHorizontal, iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   ring: 'hover:border-slate-400' },
]

interface Props {
  onSelect: (purpose: Purpose) => void
}

export default function StepPurpose({ onSelect }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8 gap-5">
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Reason for Entry</h2>
        <p className="text-slate-500 mt-1">Why is this visitor entering the yard?</p>
      </div>

      <div className="w-full max-w-sm sm:max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-2">
        {PURPOSES.map((p) => {
          const Icon = p.icon
          return (
            <button
              key={p.value}
              onClick={() => onSelect(p.value)}
              className={`flex items-center gap-4 bg-white rounded-2xl shadow-sm hover:shadow-md p-5 border-2 border-slate-100 ${p.ring} active:scale-[0.98] transition-all text-left min-h-[88px]`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${p.iconBg}`}>
                <Icon className={`w-6 h-6 ${p.iconColor}`} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 text-lg">{p.label}</div>
                <div className="text-slate-500 text-sm">{p.description}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 ml-auto shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
