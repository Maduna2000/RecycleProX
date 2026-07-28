'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import StepVisitor, { type VisitorInfo } from './components/StepVisitor'
import StepPurpose, { type Purpose } from './components/StepPurpose'
import StepCategory from './components/StepCategory'
import StepVehicle from './components/StepVehicle'
import StepPhotos, { type PhotoConfig, type PhotoKeys } from './components/StepPhotos'
import StepReview from './components/StepReview'
import CheckOutMode from './components/CheckOutMode'
import { KioskShell } from '@/components/kiosk/KioskShell'
import { colors } from '@/lib/design-tokens'

// Internal step numbers are fixed regardless of purpose (3 = Category, 4 =
// Vehicle, 5 = Photos, 6 = Review) — for non-"sell" purposes step 3 is just
// never visited, forward navigation jumps 2 -> 4 and back navigation jumps
// 4 -> 2. This keeps the step numbers stable everywhere else instead of
// renumbering the whole flow depending on purpose.
const DEFAULT_PHOTO_CONFIG: PhotoConfig = { requireIdPhoto: false, requireVehiclePhoto: true }

function useTempId() {
  const [id] = useState(() => crypto.randomUUID())
  return id
}

export default function GatePage() {
  const [mode, setMode] = useState<'entry' | 'checkout'>('entry')
  const [step, setStep] = useState(1)
  const [visitor, setVisitor] = useState<VisitorInfo | null>(null)
  const [purpose, setPurpose] = useState<Purpose | null>(null)
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [vehicleReg, setVehicleReg] = useState('')
  const [photoConfig, setPhotoConfig] = useState<PhotoConfig>(DEFAULT_PHOTO_CONFIG)
  const [photoKeys, setPhotoKeys] = useState<PhotoKeys>({})
  const tempId = useTempId()

  const steps = purpose === 'sell'
    ? ['Visitor', 'Purpose', 'Category', 'Vehicle', 'Photos', 'Review']
    : ['Visitor', 'Purpose', 'Vehicle', 'Photos', 'Review']

  function reset() {
    setStep(1)
    setVisitor(null)
    setPurpose(null)
    setCategoryNames([])
    setVehicleReg('')
    setPhotoConfig(DEFAULT_PHOTO_CONFIG)
    setPhotoKeys({})
  }

  function handleBack() {
    if (step <= 1) return
    if (step === 4 && purpose !== 'sell') {
      setStep(2) // skip back over the unused Category step
    } else {
      setStep((s) => s - 1)
    }
  }

  async function handlePurposeSelect(p: Purpose) {
    setPurpose(p)
    try {
      const res = await fetch(`/api/gate/purpose-config/${p}`)
      if (res.ok) {
        const config = await res.json()
        setPhotoConfig({
          requireIdPhoto:      config.requireIdPhoto ?? false,
          requireVehiclePhoto: config.requireVehiclePhoto ?? true,
        })
      }
    } catch {
      setPhotoConfig(DEFAULT_PHOTO_CONFIG)
    }
    setStep(p === 'sell' ? 3 : 4)
  }

  if (mode === 'checkout') {
    return <CheckOutMode onDone={() => setMode('entry')} />
  }

  // Maps the fixed internal step number to a compact 1..N display index —
  // only differs from `step` when Category (3) is skipped.
  const displayStepIndex = purpose === 'sell' ? step : ({ 1: 1, 2: 2, 4: 3, 5: 4, 6: 5 }[step] ?? step)

  return (
    <KioskShell
      current={displayStepIndex}
      total={steps.length}
      stepLabel={steps[displayStepIndex - 1]!}
      canGoBack={step > 1}
      onBack={handleBack}
      accentColor={colors.process}
      background="#F8FAFC"
      rightSlot={
        <button
          onClick={() => setMode('checkout')}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium px-3 min-h-[44px] rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Check Out
        </button>
      }
    >
      <div className="flex-1 flex flex-col overflow-y-auto">
        {step === 1 && (
          <StepVisitor onNext={(v) => { setVisitor(v); setStep(2) }} />
        )}
        {step === 2 && (
          <StepPurpose onSelect={handlePurposeSelect} />
        )}
        {step === 3 && purpose === 'sell' && (
          <StepCategory onSelect={(c) => { setCategoryNames(c); setStep(4) }} />
        )}
        {step === 4 && (
          <StepVehicle onNext={(reg) => { setVehicleReg(reg); setStep(5) }} />
        )}
        {step === 5 && (
          <StepPhotos
            entryTempId={tempId}
            config={photoConfig}
            onConfirm={(keys) => { setPhotoKeys(keys); setStep(6) }}
          />
        )}
        {step === 6 && visitor && purpose && (
          <StepReview
            visitor={visitor}
            purpose={purpose}
            categoryNames={purpose === 'sell' ? categoryNames : []}
            vehicleReg={vehicleReg}
            photoKeys={photoKeys}
            onSubmitted={reset}
          />
        )}
      </div>
    </KioskShell>
  )
}
