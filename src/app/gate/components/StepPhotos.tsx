'use client'

import { useState, useRef } from 'react'
import { Camera, CheckCircle2, Loader2, RefreshCw, UserCheck } from 'lucide-react'

interface PhotoSlot {
  key:       'id' | 'vehicle'
  label:     string
  required:  boolean
  r2Key:     string | null
  preview:   string | null
  uploading: boolean
}

export interface PhotoConfig {
  requireIdPhoto:      boolean
  requireVehiclePhoto: boolean
}

export interface PhotoKeys {
  idPhotoR2Key?:      string
  vehiclePhotoR2Key?: string
}

interface Props {
  entryTempId:     string
  config:          PhotoConfig
  /** Matched an existing account-type Customer at step 1 — both photo slots are skipped automatically. */
  isAccountHolder: boolean
  onConfirm:       (keys: PhotoKeys, exemptionNote?: string) => void
}

// Compress to JPEG via Canvas, max 1280px on the longest side, 82% quality —
// identical approach to Scale Station's Step4Photos, keeps uploads well
// under Vercel's 4.5 MB body limit.
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1280
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height / width) * MAX); width = MAX }
        else                { width  = Math.round((width / height) * MAX); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', 0.82)
    }
    img.onerror = reject
    img.src = url
  })
}

export default function StepPhotos({ entryTempId, config, isAccountHolder, onConfirm }: Props) {
  const [slots, setSlots] = useState<PhotoSlot[]>([
    { key: 'id',      label: 'ID Document', required: config.requireIdPhoto,      r2Key: null, preview: null, uploading: false },
    { key: 'vehicle', label: 'Vehicle',     required: config.requireVehiclePhoto, r2Key: null, preview: null, uploading: false },
  ])
  // Manual escape hatch for a walk-in with nothing to photograph — vehicle
  // slot only (a person always has an ID/face to photograph; only a vehicle
  // can genuinely not exist). Moot for account holders, who skip both slots
  // automatically regardless.
  const [noVehicle, setNoVehicle] = useState(false)
  const [errors, setErrors] = useState<Record<number, string | null>>({})
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  function updateSlot(i: number, patch: Partial<PhotoSlot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  async function handleFile(i: number, file: File) {
    const preview = URL.createObjectURL(file)
    updateSlot(i, { uploading: true, preview })
    setErrors((prev) => ({ ...prev, [i]: null }))

    try {
      const compressed = await compressImage(file)
      const form = new FormData()
      form.append('context', 'gate_entry')
      form.append('referenceId', entryTempId)
      form.append('photoIndex', String(i))
      form.append('file', compressed, `photo-${i}.jpg`)

      const res = await fetch('/api/r2/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Upload failed (${res.status})`)
      }
      const { key } = await res.json()
      updateSlot(i, { r2Key: key, uploading: false })
    } catch (err) {
      updateSlot(i, { uploading: false, preview: null })
      setErrors((prev) => ({ ...prev, [i]: err instanceof Error ? err.message : 'Upload failed' }))
    }
  }

  // A slot is exempt (satisfied without a photo) when the visitor is a known
  // account holder (both slots — they're already vetted), or — vehicle only —
  // the guard has marked this as a walk-in with no vehicle to photograph.
  function isExempt(slot: PhotoSlot): boolean {
    if (isAccountHolder) return true
    if (slot.key === 'vehicle' && noVehicle) return true
    return false
  }

  const canContinue = slots.every((s) => !s.required || s.r2Key !== null || isExempt(s))

  function handleConfirm() {
    const notes: string[] = []
    if (isAccountHolder) notes.push('Photos skipped — account holder')
    else if (noVehicle && slots[1]!.required) notes.push('No vehicle (walk-in)')

    onConfirm(
      {
        idPhotoR2Key:      slots[0]!.r2Key ?? undefined,
        vehiclePhotoR2Key: slots[1]!.r2Key ?? undefined,
      },
      notes.length > 0 ? notes.join('\n') : undefined,
    )
  }

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 max-w-2xl lg:max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Camera className="w-5 h-5 text-blue-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Capture Photos</h2>
      </div>
      <p className="text-slate-500 mb-5 sm:mb-6">Required photos are marked with *</p>

      {isAccountHolder && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3 mb-4 flex items-start gap-2">
          <UserCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-emerald-700 text-sm font-medium">Registered account holder — photo capture skipped</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {slots.map((slot, i) => {
          const exempt = isExempt(slot)
          return (
            <div key={slot.key} className="bg-white rounded-2xl shadow-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-700 text-sm">{slot.label}{slot.required && !exempt && ' *'}</span>
                {(slot.r2Key || exempt) && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
              </div>

              {exempt ? (
                <div className="w-full h-32 sm:h-40 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <span className="text-slate-400 text-xs font-medium">Skipped</span>
                </div>
              ) : slot.preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slot.preview} alt={slot.label} className="w-full h-32 sm:h-40 object-cover rounded-xl" />
                  {slot.uploading && (
                    <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                  {!slot.uploading && (
                    <button
                      onClick={() => { updateSlot(i, { r2Key: null, preview: null }); inputRefs[i]?.current?.click() }}
                      className="absolute top-1.5 right-1.5 bg-white/95 rounded-full shadow-md w-11 h-11 flex items-center justify-center active:scale-95 transition-transform"
                      aria-label="Retake photo"
                    >
                      <RefreshCw className="w-4 h-4 text-slate-600" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => inputRefs[i]?.current?.click()}
                  className="w-full h-32 sm:h-40 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/40 active:bg-blue-50 transition-colors"
                >
                  <Camera className="w-7 h-7 text-slate-400" />
                  <span className="text-slate-500 text-xs font-medium">Tap to capture</span>
                </button>
              )}

              {errors[i] && <p className="mt-1.5 text-red-600 text-xs">{errors[i]}</p>}

              {slot.key === 'vehicle' && !isAccountHolder && (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noVehicle}
                    onChange={(e) => setNoVehicle(e.target.checked)}
                    className="rounded"
                  />
                  No vehicle — walked in
                </label>
              )}

              <input
                ref={inputRefs[i] ?? null}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(i, f) }}
              />
            </div>
          )
        })}
      </div>

      <button
        onClick={handleConfirm}
        disabled={!canContinue}
        className="mt-6 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 text-white text-xl font-semibold h-16 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
      >
        Continue →
      </button>
    </div>
  )
}
