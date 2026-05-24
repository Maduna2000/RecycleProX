'use client'

import { useState, useRef } from 'react'
import { Camera, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

interface PhotoSlot {
  label:     string
  key:       string | null
  preview:   string | null
  uploading: boolean
}

interface Props {
  orderId:   string
  onConfirm: (photoR2Keys: string[]) => void
}

// Compress image to JPEG via Canvas, max 1280px on longest side, 82% quality.
// Keeps photos well under Vercel's 4.5 MB body limit.
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
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Canvas compression failed')),
        'image/jpeg',
        0.82,
      )
    }
    img.onerror = reject
    img.src = url
  })
}

export default function Step4Photos({ orderId, onConfirm }: Props) {
  const [slots, setSlots] = useState<PhotoSlot[]>([
    { label: 'Scale Reading', key: null, preview: null, uploading: false },
    { label: 'Product / Load', key: null, preview: null, uploading: false },
  ])
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  function updateSlot(index: number, patch: Partial<PhotoSlot>) {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  async function handleFile(index: number, file: File) {
    const preview = URL.createObjectURL(file)
    updateSlot(index, { uploading: true, preview })

    try {
      const compressed = await compressImage(file)

      const form = new FormData()
      form.append('context',     'scale_order')
      form.append('referenceId', orderId)
      form.append('photoIndex',  String(index))
      form.append('file',        compressed, `photo-${index}.jpg`)

      const res = await fetch('/api/r2/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Upload failed (${res.status})`)
      }
      const { key } = await res.json()
      updateSlot(index, { key, uploading: false })
    } catch (err) {
      updateSlot(index, { uploading: false, preview: null })
      alert(err instanceof Error ? err.message : `Failed to upload photo ${index + 1}. Please try again.`)
    }
  }

  function handleInputChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(index, file)
  }

  const allDone = slots.every(s => s.key !== null)

  function handleConfirm() {
    const keys = slots.map(s => s.key!).filter(Boolean)
    if (keys.length === 2) onConfirm(keys)
  }

  return (
    <div className="flex-1 flex flex-col p-5 max-w-md mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Capture Photos</h2>
      <p className="text-slate-500 mb-6">Take a photo of the scale reading and the product/load</p>

      <div className="flex flex-col gap-5">
        {slots.map((slot, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-md p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-700">{i + 1}. {slot.label}</span>
              {slot.key && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            </div>

            {slot.preview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slot.preview} alt={slot.label} className="w-full h-48 object-cover rounded-xl" />
                {slot.uploading && (
                  <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center gap-2">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                    <span className="text-white font-medium">Uploading…</span>
                  </div>
                )}
                {!slot.uploading && (
                  <button
                    onClick={() => { updateSlot(i, { key: null, preview: null }); inputRefs[i]?.current?.click() }}
                    className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-600" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => inputRefs[i]?.current?.click()}
                className="w-full h-48 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-emerald-400 transition-colors"
              >
                <Camera className="w-10 h-10 text-slate-400" />
                <span className="text-slate-500 font-medium">Tap to take photo</span>
              </button>
            )}

            <input
              ref={inputRefs[i] ?? null}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => handleInputChange(i, e)}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleConfirm}
        disabled={!allDone}
        className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xl font-semibold h-16 rounded-xl transition-colors"
      >
        Continue →
      </button>
    </div>
  )
}
