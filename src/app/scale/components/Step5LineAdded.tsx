'use client'

import { CheckCircle2, Plus, ArrowRight } from 'lucide-react'

export interface CartLine {
  productId:    string
  productName:  string
  categoryName: string
  unit:         string
  weight:       string | null  // Null when weight step is skipped
  photoR2Keys:  string[]       // Used when online
  photoBlobs?:  Blob[]         // Used when offline
}

interface Props {
  justAdded: CartLine
  cart:      CartLine[]
  /** Items still waiting from a multi-select pick — when > 0, "Add Another" moves straight to weighing the next one. */
  queueRemaining?: number
  onAddAnother: () => void
  onReview:     () => void
}

export default function Step5LineAdded({ justAdded, cart, queueRemaining = 0, onAddAnother, onReview }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full gap-5">

      {/* Success indicator */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-emerald-600" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800">Product Added</h2>
          <p className="text-slate-500 mt-1">
            {justAdded.productName}
            {justAdded.weight && ` — ${parseFloat(justAdded.weight).toFixed(2)} ${justAdded.unit}`}
          </p>
        </div>
      </div>

      {/* Cart summary */}
      <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {cart.length} item{cart.length !== 1 ? 's' : ''} in order
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {cart.map((item, i) => (
            <div key={i} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="font-medium text-slate-800 text-sm">{item.productName}</p>
                <p className="text-xs text-slate-400">{item.categoryName}</p>
              </div>
              {item.weight && (
                <span className="font-semibold text-slate-700 text-sm font-mono">
                  {parseFloat(item.weight).toFixed(2)} {item.unit}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full flex flex-col gap-3">
        <button
          onClick={onAddAnother}
          className="w-full border-2 border-emerald-500 text-emerald-700 text-lg font-semibold h-14 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors"
        >
          {queueRemaining > 0
            ? <><ArrowRight className="w-5 h-5" /> Weigh Next Item ({queueRemaining} more waiting)</>
            : <><Plus className="w-5 h-5" /> Add Another Product</>}
        </button>

        <button
          onClick={onReview}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold h-14 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          Review ({cart.length} item{cart.length !== 1 ? 's' : ''}) <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
