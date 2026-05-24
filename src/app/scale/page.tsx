'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  const [step, setStep]               = useState(1)
  const [direction, setDirection]     = useState<'forward' | 'back'>('forward')
  const [customer, setCustomer]       = useState<SelectedCustomer | null>(null)
  const [product, setProduct]         = useState<SelectedProduct | null>(null)
  const [weight, setWeight]           = useState<string | null>(null)
  const [photoR2Keys, setPhotoR2Keys] = useState<string[]>([])
  const tempId = useTempId()

  function reset() {
    setStep(1)
    setDirection('forward')
    setCustomer(null)
    setProduct(null)
    setWeight(null)
    setPhotoR2Keys([])
  }

  function handleBack() {
    if (step <= 1) return
    setDirection('back')
    setStep(s => s - 1)
  }

  // Slide class: entering step slides in from the appropriate direction
  const slideClass = direction === 'forward'
    ? 'animate-in slide-in-from-right duration-[220ms]'
    : 'animate-in slide-in-from-left  duration-[220ms]'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Progress bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 max-w-lg mx-auto lg:max-w-none">

          {/* Global Back button — shown on steps 2–5, hidden on step 1 */}
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-slate-500 text-sm min-h-[44px] px-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          {/* Step dots — hidden on desktop (sidebar handles it there) */}
          <div className="flex justify-between items-center flex-1 lg:hidden">
            {STEPS.map((label, i) => {
              const num    = i + 1
              const active = step === num
              const done   = step > num
              return (
                <div key={num} className="flex flex-col items-center gap-1 flex-1">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                    done   ? 'bg-emerald-500 text-white'                          : '',
                    active ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'  : '',
                    !done && !active ? 'bg-slate-200 text-slate-400'              : '',
                  )}>
                    {done ? '✓' : num}
                  </div>
                  <span className={cn(
                    'text-xs hidden sm:block',
                    active ? 'text-emerald-700 font-semibold' : 'text-slate-400',
                  )}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Desktop: compact step counter in place of dots */}
          <span className="hidden lg:inline text-sm text-slate-500 font-medium">
            Step {step} of {STEPS.length} — {STEPS[step - 1]}
          </span>
        </div>
      </div>

      {/* Body: sidebar (desktop) + animated step content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Desktop sidebar — hidden on mobile/tablet */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 bg-white border-r border-slate-200 p-4 gap-1 overflow-y-auto">
          {STEPS.map((label, i) => {
            const num     = i + 1
            const done    = step > num
            const active  = step === num
            const canJump = done
            return (
              <button
                key={num}
                disabled={!canJump && !active}
                onClick={() => { if (canJump) { setDirection('back'); setStep(num) } }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors text-sm w-full',
                  active  ? 'bg-emerald-50 text-emerald-700 font-semibold'           : '',
                  done    ? 'text-slate-700 hover:bg-slate-100 cursor-pointer'        : '',
                  !done && !active ? 'text-slate-400 cursor-default'                 : '',
                )}
              >
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  done   ? 'bg-emerald-500 text-white'                       : '',
                  active ? 'bg-emerald-600 text-white ring-2 ring-emerald-200' : '',
                  !done && !active ? 'bg-slate-200 text-slate-400'            : '',
                )}>
                  {done ? '✓' : num}
                </span>
                {label}
              </button>
            )
          })}
        </aside>

        {/* Step content — key={step} forces remount → triggers slide animation */}
        <div
          key={step}
          className={cn('flex-1 flex flex-col overflow-y-auto overflow-x-hidden', slideClass)}
        >
          {step === 1 && (
            <Step1Customer
              onSelect={c => { setDirection('forward'); setCustomer(c); setStep(2) }}
            />
          )}
          {step === 2 && (
            <Step2Product
              onSelect={p => { setDirection('forward'); setProduct(p); setStep(3) }}
            />
          )}
          {step === 3 && product && (
            <Step3Weight
              unit={product.unit}
              onConfirm={w => { setDirection('forward'); setWeight(w); setStep(4) }}
            />
          )}
          {step === 4 && (
            <Step4Photos
              orderId={tempId}
              onConfirm={keys => { setDirection('forward'); setPhotoR2Keys(keys); setStep(5) }}
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
    </div>
  )
}
