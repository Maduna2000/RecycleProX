'use client'

import { useState, useRef } from 'react'
import { Camera, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

interface PhotoSlot {
  key:       'id' | 'vehicle' | 'face'
  label:     string
  required:  boolean
  r2Key:     string | null
  preview:   string | null
  uploading: boolean
}

export interface PhotoConfig {
  requireIdPhoto:      boolean
  requireVehiclePhoto: boolean
  requireFacePhoto:    boolean
}

export interface PhotoKeys {
  idPhotoR2Key?:      string
  vehiclePhotoR2Key?: string
  facePhotoR2Key?:    string
}

interface Props {
  entryTempId: string
  config:      PhotoConfig
  onConfirm:   (keys: PhotoKeys) => void
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

export default function StepPhotos({ entryTempId, config, onConfirm }: Props) {
  const [slots, setSlots] = useState<PhotoSlot[]>([
    { key: 'id',      label: 'ID Document',   required: config.requireIdPhoto,      r2Key: null, preview: null, uploading: false },
    { key: 'vehicle', label: 'Vehicle',       required: config.requireVehiclePhoto, r2Key: null, preview: null, uploading: false },
    { key: 'face',    label: 'Visitor Face',  required: config.requireFacePhoto,    r2Key: null, preview: null, uploading: false },
  ])
  const [errors, setErrors] = useState<Record<number, string | null>>({})
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

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

  const canContinue = slots.every((s) => !s.required || s.r2Key !== null)

  function handleConfirm() {
    onConfirm({
      idPhotoR2Key:      slots[0]!.r2Key ?? undefined,
      vehiclePhotoR2Key: slots[1]!.r2Key ?? undefined,
      facePhotoR2Key:    slots[2]!.r2Key ?? undefined,
    })
  }

  return (
    <div className="flex-1 flex flex-col p-5 max-w-2xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Capture Photos</h2>
      <p className="text-slate-500 mb-4">Required photos are marked with *</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {slots.map((slot, i) => (
          <div key={slot.key} className="bg-white rounded-2xl shadow-md p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-700 text-sm">{slot.label}{slot.required && ' *'}</span>
              {slot.r2Key && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </div>

            {slot.preview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slot.preview} alt={slot.label} className="w-full h-32 object-cover rounded-xl" />
                {slot.uploading && (
                  <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
                {!slot.uploading && (
                  <button
                    onClick={() => { updateSlot(i, { r2Key: null, preview: null }); inputRefs[i]?.current?.click() }}
                    className="absolute top-1.5 right-1.5 bg-white/90 rounded-full shadow w-8 h-8 flex items-center justify-center"
                    aria-label="Retake photo"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => inputRefs[i]?.current?.click()}
                className="w-full h-32 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-emerald-400 transition-colors"
              >
                <Camera className="w-7 h-7 text-slate-400" />
                <span className="text-slate-500 text-xs font-medium">Tap to capture</span>
              </button>
            )}

            {errors[i] && <p className="mt-1.5 text-red-600 text-xs">{errors[i]}</p>}

            <input
              ref={inputRefs[i] ?? null}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(i, f) }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleConfirm}
        disabled={!canContinue}
        className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xl font-semibold h-16 rounded-xl transition-colors"
      >
        Continue →
      </button>
    </div>
  )
}
