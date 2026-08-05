'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { offlineDB } from '@/lib/offline/db'
import { saveDraft, loadDraft, clearDraft } from '@/lib/offline/scaleDraftService'
import Step1Customer, { type SelectedCustomer } from './components/Step1Customer'
import Step2Product,  { type SelectedProduct }  from './components/Step2Product'
import Step3Weight  from './components/Step3Weight'
import Step4Photos  from './components/Step4Photos'
import Step5LineAdded, { type CartLine } from './components/Step5LineAdded'
import Step6Review  from './components/Step5Review'
import { KioskShell } from '@/components/kiosk/KioskShell'
import { colors } from '@/lib/design-tokens'

// Step config type
interface StepConfig {
  requireWeight: boolean
  requirePhotos: boolean
}

// Default config - all steps required
const DEFAULT_CONFIG: StepConfig = { requireWeight: true, requirePhotos: true }

function useTempId() {
  const [id] = useState(() => crypto.randomUUID())
  return id
}

export default function ScalePage() {
  const [step, setStep]             = useState(1)
  const [direction, setDirection]   = useState<'forward' | 'back'>('forward')
  const [customer, setCustomer]     = useState<SelectedCustomer | null>(null)
  const [product, setProduct]       = useState<SelectedProduct | null>(null)
  const [productQueue, setProductQueue] = useState<SelectedProduct[]>([])
  const [weight, setWeight]         = useState<string | null>(null)
  const [cart, setCart]             = useState<CartLine[]>([])
  const [justAdded, setJustAdded]   = useState<CartLine | null>(null)
  const [stepConfig, setStepConfig] = useState<StepConfig>(DEFAULT_CONFIG)
  const tempId = useTempId()

  // ── Draft persistence ─────────────────────────────────────────────────
  // A network drop or reload used to wipe the whole in-progress order —
  // customer, confirmed cart lines, everything — forcing the operator to
  // start over. Restored once on mount from IndexedDB (see
  // scaleDraftService.ts); saved again on every change to the fields
  // below once that restore attempt has finished, so the empty initial
  // state doesn't overwrite a real draft before it's had a chance to load.
  const draftRestored = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadDraft().then(draft => {
      if (cancelled || !draft) { draftRestored.current = true; return }
      setStep(draft.step)
      setCustomer(draft.customer)
      setProduct(draft.product)
      setProductQueue(draft.productQueue)
      setWeight(draft.weight)
      setCart(draft.cart)
      setJustAdded(draft.justAdded)
      setStepConfig(draft.stepConfig)
      draftRestored.current = true
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!draftRestored.current) return
    if (step === 1 && !customer && cart.length === 0) {
      // Nothing worth saving yet (fresh/just-reset state) — avoid writing
      // an empty draft row on every mount.
      void clearDraft()
      return
    }
    void saveDraft({ step, customer, product, productQueue, weight, cart, justAdded, stepConfig, savedAt: Date.now() })
  }, [step, customer, product, productQueue, weight, cart, justAdded, stepConfig])

  // Compute enabled steps based on current config
  const enabledSteps = useMemo(() => {
    const steps = ['Customer', 'Product']
    if (stepConfig.requireWeight) steps.push('Weight')
    if (stepConfig.requirePhotos) steps.push('Photos')
    steps.push('Review')
    return steps
  }, [stepConfig])

  // Fetch step config for a category (with offline caching)
  const fetchStepConfig = useCallback(async (categoryId: string): Promise<StepConfig> => {
    try {
      // Try online fetch first
      const res = await fetch(`/api/scale/step-config/${categoryId}`)
      if (res.ok) {
        const data = await res.json()
        const config: StepConfig = {
          requireWeight: data.requireWeight ?? true,
          requirePhotos: data.requirePhotos ?? true,
        }
        // Cache for offline use
        await offlineDB.stepConfigs.put({
          categoryId,
          requireWeight: config.requireWeight,
          requirePhotos: config.requirePhotos,
          updatedAt: new Date().toISOString(),
        }).catch(() => {}) // Ignore cache errors
        return config
      }
    } catch {
      // Offline or network error - try cache
    }

    // Fallback to cached config
    try {
      const cached = await offlineDB.stepConfigs.get(categoryId)
      if (cached) {
        return {
          requireWeight: cached.requireWeight,
          requirePhotos: cached.requirePhotos,
        }
      }
    } catch {
      // Cache read failed
    }

    return DEFAULT_CONFIG
  }, [])

  function reset() {
    setStep(1)
    setDirection('forward')
    setCustomer(null)
    setProduct(null)
    setProductQueue([])
    setWeight(null)
    setCart([])
    setJustAdded(null)
    setStepConfig(DEFAULT_CONFIG)
    void clearDraft()
  }

  function handleBack() {
    if (step <= 1) return
    setDirection('back')

    // Smart navigation: skip disabled steps when going back
    let nextStep: number
    if (step === 6) {
      // From Review (step 6) go back to LineAdded (step 5)
      nextStep = 5
    } else if (step === 5) {
      // From LineAdded (step 5) go back to Photos (step 4) or Weight (step 3) if photos disabled
      nextStep = stepConfig.requirePhotos ? 4 : (stepConfig.requireWeight ? 3 : 2)
    } else if (step === 4) {
      // From Photos (step 4) go back to Weight (step 3) or Product (step 2) if weight disabled
      nextStep = stepConfig.requireWeight ? 3 : 2
    } else {
      nextStep = step - 1
    }

    // Landing back on the picker abandons any items still waiting in a
    // multi-select queue — otherwise they'd sit invisibly and be silently
    // dropped the next time a fresh batch is picked.
    if (nextStep === 2 && productQueue.length > 0) setProductQueue([])
    setStep(nextStep)
  }

  // Fetch config and navigate to the next step for one product
  async function beginProduct(p: SelectedProduct) {
    setProduct(p)
    const config = await fetchStepConfig(p.categoryId)
    setStepConfig(config)
    setDirection('forward')

    // Navigate to next enabled step
    if (config.requireWeight) {
      setStep(3) // Weight step
    } else if (config.requirePhotos) {
      setWeight(null) // No weight when skipped
      setStep(4) // Photos step
    } else {
      // Both disabled - go directly to LineAdded with empty values
      setWeight(null)
      addToCartAndShowConfirmation(p, null, [], undefined)
    }
  }

  // Handle a batch pick from Step2Product's multi-select — process the first
  // item now, queue the rest to be picked up automatically from Step5's
  // "Add Another" action instead of returning to the category grid each time.
  async function handleProductsSelected(list: SelectedProduct[]) {
    if (list.length === 0) return
    const [first, ...rest] = list
    setProductQueue(rest)
    await beginProduct(first!)
  }

  // Helper to add item to cart
  function addToCartAndShowConfirmation(
    prod: SelectedProduct,
    w: string | null,
    photoR2Keys: string[],
    photoBlobs?: Blob[]
  ) {
    const line: CartLine = {
      productId:    prod.id,
      productName:  prod.name,
      categoryName: prod.categoryName,
      unit:         prod.unit,
      weight:       w,
      photoR2Keys,
      photoBlobs,
    }
    setCart(prev => [...prev, line])
    setJustAdded(line)
    setDirection('forward')
    setStep(5)
  }

  // When weight is confirmed
  function handleWeightConfirm(w: string) {
    setWeight(w)
    setDirection('forward')

    if (stepConfig.requirePhotos) {
      setStep(4) // Go to photos
    } else {
      // Photos skipped - add to cart directly
      if (product) {
        addToCartAndShowConfirmation(product, w, [], undefined)
      }
    }
  }

  // When photos are confirmed: push to cart, show LineAdded confirmation
  function handlePhotosConfirm(photoR2Keys: string[], photoBlobs?: Blob[]) {
    if (!product) return
    // Use current weight (could be null if weight step was skipped)
    addToCartAndShowConfirmation(product, weight, photoR2Keys, photoBlobs)
  }

  function handleAddAnother() {
    // Items queued from a multi-select pick skip the category grid entirely
    // and go straight into weighing the next one.
    if (productQueue.length > 0) {
      const [next, ...rest] = productQueue
      setProductQueue(rest)
      setJustAdded(null)
      void beginProduct(next!)
      return
    }

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

  function handleUpdateLine(index: number, updates: Partial<CartLine>) {
    setCart(prev => prev.map((line, i) =>
      i === index ? { ...line, ...updates } : line
    ))
  }

  // Progress bar: calculate display step based on enabled steps
  // step 5 (LineAdded) is transient, step 6 (Review) is last
  const displayStep = useMemo(() => {
    if (step === 5) {
      // LineAdded - show as last enabled step before Review (which is Photos or Weight or Product)
      return enabledSteps.length - 1
    }
    if (step === 6) {
      // Review
      return enabledSteps.length
    }
    // Map actual step to enabled step index
    const stepNames = ['Customer', 'Product', 'Weight', 'Photos']
    const currentStepName = stepNames[step - 1] ?? ''
    const idx = enabledSteps.indexOf(currentStepName)
    return idx >= 0 ? idx + 1 : step
  }, [step, enabledSteps])

  const slideClass = direction === 'forward'
    ? 'animate-in slide-in-from-right duration-[220ms]'
    : 'animate-in slide-in-from-left  duration-[220ms]'

  return (
    <KioskShell
      current={displayStep}
      total={enabledSteps.length}
      stepLabel={enabledSteps[displayStep - 1]!}
      canGoBack={step > 1}
      onBack={handleBack}
      accentColor={colors.action}
      rightSlot={
        cart.length > 0 && step < 6 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
            {cart.length} item{cart.length !== 1 ? 's' : ''} in order
          </span>
        ) : undefined
      }
    >
      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        <aside className="hidden lg:flex flex-col w-52 shrink-0 bg-white border-r border-slate-200 p-4 gap-1 overflow-y-auto">
          {enabledSteps.map((label, i) => {
            const num     = i + 1
            const done    = displayStep > num
            const active  = displayStep === num
            // Map back to actual step number for navigation
            const stepMap: Record<string, number> = { Customer: 1, Product: 2, Weight: 3, Photos: 4, Review: 6 }
            const actualStep = stepMap[label] ?? num
            const canJump = done && actualStep < step
            return (
              <button
                key={label}
                disabled={!canJump && !active}
                onClick={() => { if (canJump) { setDirection('back'); setStep(actualStep) } }}
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
              onContinue={handleProductsSelected}
            />
          )}
          {step === 3 && product && (
            <Step3Weight
              unit={product.unit}
              onConfirm={handleWeightConfirm}
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
              queueRemaining={productQueue.length}
              onAddAnother={handleAddAnother}
              onReview={handleGoToReview}
            />
          )}
          {step === 6 && customer && cart.length > 0 && (
            <Step6Review
              customer={customer}
              cart={cart}
              onRemoveLine={handleRemoveLine}
              onUpdateLine={handleUpdateLine}
              onNewOrder={reset}
              onOrderSubmitted={clearDraft}
            />
          )}
        </div>
      </div>
    </KioskShell>
  )
}
