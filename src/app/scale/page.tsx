'use client'

import { useState } from 'react'
import Step1Customer, { type SelectedCustomer } from './components/Step1Customer'
import Step2Product,  { type SelectedProduct }  from './components/Step2Product'
import Step3Weight  from './components/Step3Weight'
import Step4Photos  from './components/Step4Photos'
import Step5Review  from './components/Step5Review'

const STEPS = ['Customer', 'Product', 'Weight', 'Photos', 'Review']

// A stable temporary UUID used for R2 key prefixing during photo upload.
// The real order ID is generated server-side on submit.
function useTempId() {
  const [id] = useState(() => crypto.randomUUID())
  return id
}

export default function ScalePage() {
  const [step, setStep]             = useState(1)
  const [customer, setCustomer]     = useState<SelectedCustomer | null>(null)
  const [product, setProduct]       = useState<SelectedProduct | null>(null)
  const [weight, setWeight]         = useState<string | null>(null)
  const [photoR2Keys, setPhotoR2Keys] = useState<string[]>([])
  const tempId = useTempId()

  function reset() {
    setStep(1)
    setCustomer(null)
    setProduct(null)
    setWeight(null)
    setPhotoR2Keys([])
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Progress bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          {STEPS.map((label, i) => {
            const num     = i + 1
            const active  = step === num
            const done    = step > num
            return (
              <div key={num} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${done   ? 'bg-emerald-500 text-white'   : ''}
                  ${active ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : ''}
                  ${!done && !active ? 'bg-slate-200 text-slate-400' : ''}
                `}>
                  {done ? '✓' : num}
                </div>
                <span className={`text-xs hidden sm:block ${active ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {step === 1 && (
          <Step1Customer
            onSelect={c => { setCustomer(c); setStep(2) }}
          />
        )}
        {step === 2 && (
          <Step2Product
            onSelect={p => { setProduct(p); setStep(3) }}
          />
        )}
        {step === 3 && product && (
          <Step3Weight
            unit={product.unit}
            onConfirm={w => { setWeight(w); setStep(4) }}
          />
        )}
        {step === 4 && (
          <Step4Photos
            orderId={tempId}
            onConfirm={keys => { setPhotoR2Keys(keys); setStep(5) }}
          />
        )}
        {step === 5 && customer && product && weight && (
          <Step5Review
            customer={customer}
            product={product}
            weight={weight}
            photoR2Keys={photoR2Keys}
            onNewOrder={reset}
          />
        )}
      </div>
    </div>
  )
}
