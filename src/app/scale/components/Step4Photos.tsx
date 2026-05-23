'use client'

import { useState, useRef } from 'react'
import { Camera, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

interface PhotoSlot {
  label:    string
  key:      string | null
  preview:  string | null
  uploading: boolean
}

interface Props {
  orderId:   string   // temporary UUID for key generation
  onConfirm: (photoR2Keys: string[]) => void
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
    updateSlot(index, { uploading: true, preview: URL.createObjectURL(file) })

    try {
      // Get presigned upload URL
      const urlRes = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context:     'scale_order',
          referenceId: orderId,
          contentType: file.type,
          fileSize:    file.size,
          photoIndex:  index,
        }),
      })
      if (!urlRes.ok) throw new Error('Failed to get upload URL')
      const { uploadUrl, key } = await urlRes.json()

      // Upload directly to R2
      const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!putRes.ok) throw new Error('Upload failed')

      updateSlot(index, { key, uploading: false })
    } catch {
      updateSlot(index, { uploading: false, preview: null })
      alert(`Failed to upload photo ${index + 1}. Please try again.`)
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
                  <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
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
