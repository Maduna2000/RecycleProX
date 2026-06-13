'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import Step1Customer, { type SelectedCustomer } from './components/Step1Customer'
import Step2Product,  { type SelectedProduct }  from './components/Step2Product'
import Step3Weight  from './components/Step3Weight'
import Step4Photos  from './components/Step4Photos'
import Step5LineAdded, { type CartLine } from './components/Step5LineAdded'
import Step6Review  from './components/Step5Review'

// Steps shown in the progress bar (LineAdded is a transient step, not shown)
const STEPS = ['Customer', 'Product', 'Weight', 'Photos', 'Review']

function useTempId() {
  const [id] = useState(() => crypto.randomUUID())
  return id
}

export default function ScalePage() {
  const [step, setStep]             = useState(1)
  const [direction, setDirection]   = useState<'forward' | 'back'>('forward')
  const [customer, setCustomer]     = useState<SelectedCustomer | null>(null)
  const [product, setProduct]       = useState<SelectedProduct | null>(null)
  const [weight, setWeight]         = useState<string | null>(null)
  const [cart, setCart]             = useState<CartLine[]>([])
  const [justAdded, setJustAdded]   = useState<CartLine | null>(null)
  const tempId = useTempId()

  function reset() {
    setStep(1)
    setDirection('forward')
    setCustomer(null)
    setProduct(null)
    setWeight(null)
    setCart([])
    setJustAdded(null)
  }

  function handleBack() {
    if (step <= 1) return
    setDirection('back')
    // From review (step 6) go back to LineAdded (step 5)
    // From LineAdded (step 5) go back to Photos (step 4)
    // Otherwise normal step - 1
    setStep(s => s - 1)
  }

  // When photos are confirmed: push to cart, show LineAdded confirmation
  function handlePhotosConfirm(photoR2Keys: string[], photoBlobs?: Blob[]) {
    if (!product || !weight) return
    const line: CartLine = {
      productId:    product.id,
      productName:  product.name,
      categoryName: product.categoryName,
      unit:         product.unit,
      weight,
      photoR2Keys,
      photoBlobs,
    }
    const newCart = [...cart, line]
    setCart(newCart)
    setJustAdded(line)
    setDirection('forward')
    setStep(5) // LineAdded step
  }

  function handleAddAnother() {
    // Clear current line state, go back to Product step (keep customer)
    setProduct(null)
    setWeight(null)
    setJustAdded(null)
    setDirection('forward')
    setStep(2)
  }

  function handleGoToReview() {
    setDirection('forward')
    setStep(6)
  }

  function handleRemoveLine(index: number) {
    setCart(prev => prev.filter((_, i) => i !== index))
  }

  // Progress bar: steps 1–4 map to display steps 1–4, step 5 (LineAdded) shows as step 4 done,
  // step 6 (Review) shows as step 5.
  const displayStep = step === 5 ? 4 : step === 6 ? 5 : step

  const slideClass = direction === 'forward'
    ? 'animate-in slide-in-from-right duration-[220ms]'
    : 'animate-in slide-in-from-left  duration-[220ms]'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Progress bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 max-w-lg mx-auto lg:max-w-none">

          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-slate-500 text-sm min-h-[44px] px-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          {/* Cart badge — shown once at least 1 item in cart */}
          {cart.length > 0 && step < 6 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full shrink-0">
              {cart.length} item{cart.length !== 1 ? 's' : ''} in order
            </span>
          )}

          <div className="flex justify-between items-center flex-1 lg:hidden">
            {STEPS.map((label, i) => {
              const num    = i + 1
              const active = displayStep === num
              const done   = displayStep > num
              return (
                <div key={num} className="flex flex-col items-center gap-1 flex-1">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                    done   ? 'bg-emerald-500 text-white'                         : '',
                    active ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : '',
                    !done && !active ? 'bg-slate-200 text-slate-400'             : '',
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

          <span className="hidden lg:inline text-sm text-slate-500 font-medium">
            Step {displayStep} of {STEPS.length} — {STEPS[displayStep - 1]}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        <aside className="hidden lg:flex flex-col w-52 shrink-0 bg-white border-r border-slate-200 p-4 gap-1 overflow-y-auto">
          {STEPS.map((label, i) => {
            const num     = i + 1
            const done    = displayStep > num
            const active  = displayStep === num
            const canJump = done
            return (
              <button
                key={num}
                disabled={!canJump && !active}
                onClick={() => { if (canJump) { setDirection('back'); setStep(num) } }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors text-sm w-full',
                  active  ? 'bg-emerald-50 text-emerald-700 font-semibold'        : '',
                  done    ? 'text-slate-700 hover:bg-slate-100 cursor-pointer'    : '',
                  !done && !active ? 'text-slate-400 cursor-default'              : '',
                )}
              >
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  done   ? 'bg-emerald-500 text-white'                        : '',
                  active ? 'bg-emerald-600 text-white ring-2 ring-emerald-200' : '',
                  !done && !active ? 'bg-slate-200 text-slate-400'            : '',
                )}>
                  {done ? '✓' : num}
                </span>
                {label}
              </button>
            )
          })}

          {cart.length > 0 && (
            <div className="mt-3 px-3 py-2 bg-emerald-50 rounded-xl">
              <p className="text-xs font-semibold text-emerald-700">{cart.length} item{cart.length !== 1 ? 's' : ''} added</p>
              {cart.map((item, i) => (
                <p key={i} className="text-xs text-emerald-600 truncate">{item.productName}</p>
              ))}
            </div>
          )}
        </aside>

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
              onConfirm={handlePhotosConfirm}
            />
          )}
          {step === 5 && justAdded && (
            <Step5LineAdded
              justAdded={justAdded}
              cart={cart}
              onAddAnother={handleAddAnother}
              onReview={handleGoToReview}
            />
          )}
          {step === 6 && customer && cart.length > 0 && (
            <Step6Review
              customer={customer}
              cart={cart}
              onRemoveLine={handleRemoveLine}
              onNewOrder={reset}
            />
          )}
        </div>
      </div>
    </div>
  )
}
