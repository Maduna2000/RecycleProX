'use client'

import { useState, useEffect } from 'react'
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

// The kiosk tablet's WebView can be reloaded from scratch by Android at any
// time under memory pressure (backgrounding the app, another app hogging
// RAM) — this is normal WebView/Chrome behavior, not something an APK vs. a
// plain URL avoids. photoKeys only ever holds already-uploaded R2 key
// strings (never raw File blobs), so the whole in-progress entry is safely
// JSON-serializable — persisting it here means a guard mid-entry never
// loses their place to one of these reloads. DOM storage is explicitly
// enabled in MainActivity.java's WebView config, so this survives a process
// kill the same way it would in a real installed app.
const WIP_STORAGE_KEY = 'gate-wip-session'
const WIP_MAX_AGE_MS = 4 * 60 * 60 * 1000 // a shift-length window — older than this is presumed abandoned

type WipState = {
  step: number
  visitor: VisitorInfo | null
  purpose: Purpose | null
  categoryNames: string[]
  vehicleReg: string
  photoConfig: PhotoConfig
  photoKeys: PhotoKeys
  photoExemptionNote: string | undefined
  vehicleExempt: boolean | undefined
  tempId: string
  savedAt: number
}

function loadWip(): WipState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(WIP_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WipState
    if (Date.now() - parsed.savedAt > WIP_MAX_AGE_MS) {
      window.localStorage.removeItem(WIP_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function clearWip() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(WIP_STORAGE_KEY) } catch { /* ignore */ }
}

export default function GatePage() {
  const [restored] = useState(loadWip)
  const [mode, setMode] = useState<'entry' | 'checkout'>('entry')
  const [step, setStep] = useState(() => restored?.step ?? 1)
  const [visitor, setVisitor] = useState<VisitorInfo | null>(() => restored?.visitor ?? null)
  const [purpose, setPurpose] = useState<Purpose | null>(() => restored?.purpose ?? null)
  const [categoryNames, setCategoryNames] = useState<string[]>(() => restored?.categoryNames ?? [])
  const [vehicleReg, setVehicleReg] = useState(() => restored?.vehicleReg ?? '')
  const [photoConfig, setPhotoConfig] = useState<PhotoConfig>(() => restored?.photoConfig ?? DEFAULT_PHOTO_CONFIG)
  const [photoKeys, setPhotoKeys] = useState<PhotoKeys>(() => restored?.photoKeys ?? {})
  const [photoExemptionNote, setPhotoExemptionNote] = useState<string | undefined>(() => restored?.photoExemptionNote)
  const [vehicleExempt, setVehicleExempt] = useState<boolean | undefined>(() => restored?.vehicleExempt)
  const [tempId] = useState(() => restored?.tempId ?? crypto.randomUUID())

  // Persist on every change so a mid-entry reload can resume exactly where
  // the guard left off. Skipped while in 'checkout' mode — that's a
  // separate, self-contained flow with its own state.
  useEffect(() => {
    if (mode !== 'entry') return
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(WIP_STORAGE_KEY, JSON.stringify({
        step, visitor, purpose, categoryNames, vehicleReg, photoConfig,
        photoKeys, photoExemptionNote, vehicleExempt, tempId,
        savedAt: Date.now(),
      } satisfies WipState))
    } catch { /* localStorage unavailable/full — WIP just won't survive a reload, not fatal */ }
  }, [mode, step, visitor, purpose, categoryNames, vehicleReg, photoConfig, photoKeys, photoExemptionNote, vehicleExempt, tempId])

  const steps = purpose === 'sell'
    ? ['Visitor', 'Purpose', 'Category', 'Vehicle', 'Photos', 'Review']
    : ['Visitor', 'Purpose', 'Vehicle', 'Photos', 'Review']

  function reset() {
    clearWip()
    setStep(1)
    setVisitor(null)
    setPurpose(null)
    setCategoryNames([])
    setVehicleReg('')
    setPhotoConfig(DEFAULT_PHOTO_CONFIG)
    setPhotoKeys({})
    setPhotoExemptionNote(undefined)
    setVehicleExempt(undefined)
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
            isAccountHolder={visitor?.isAccountHolder ?? false}
            onConfirm={(keys, exemptionNote, exempt) => { setPhotoKeys(keys); setPhotoExemptionNote(exemptionNote); setVehicleExempt(exempt); setStep(6) }}
          />
        )}
        {step === 6 && visitor && purpose && (
          <StepReview
            visitor={visitor}
            purpose={purpose}
            categoryNames={purpose === 'sell' ? categoryNames : []}
            vehicleReg={vehicleReg}
            photoKeys={photoKeys}
            notes={photoExemptionNote}
            vehicleExempt={vehicleExempt}
            onSubmitted={reset}
          />
        )}
      </div>
    </KioskShell>
  )
}
