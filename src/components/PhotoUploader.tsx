'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, X, Camera } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  context: 'customer_id' | 'purchase_photo'
  referenceId: string
  onUploaded: (key: string) => void
  disabled?: boolean
  label?: string
}

export function PhotoUploader({ context, referenceId, onUploaded, disabled, label = 'Upload Photo' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed (JPEG, PNG, WebP)')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large — maximum 10 MB')
      return
    }

    setUploading(true)
    setProgress(10)

    try {
      const fd = new FormData()
      fd.append('context', context)
      fd.append('referenceId', referenceId)
      fd.append('file', file)

      setProgress(40)
      const res = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json()
        toast.error(j.error ?? 'Upload failed')
        return
      }
      const { key } = await res.json() as { key: string }
      setProgress(100)
      toast.success('Photo uploaded successfully')
      onUploaded(key)
    } catch {
      toast.error('Upload failed — check your connection')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
        disabled || uploading ? 'opacity-60 cursor-not-allowed bg-gray-50' : 'hover:border-green-400 hover:bg-green-50 cursor-pointer'
      }`}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={onInputChange}
        capture="environment"
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          <p className="text-sm text-gray-600">Uploading... {progress}%</p>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-green-600 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <Camera className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">Drag & drop or click to browse · JPEG, PNG, WebP · max 10 MB</p>
          <Button type="button" variant="outline" size="sm" className="mt-1" disabled={disabled}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> Choose File
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Photo Viewer ─────────────────────────────────────────────────────────────

interface ViewerProps {
  r2Key: string
  alt?: string
  onDelete?: () => void
  canDelete?: boolean
}

export function PhotoViewer({ r2Key, alt = 'Photo', onDelete, canDelete }: ViewerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function loadUrl() {
    if (url) { setExpanded(true); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/r2/view-url?key=${encodeURIComponent(r2Key)}`)
      if (res.ok) {
        const data = await res.json() as { url: string }
        setUrl(data.url)
        setExpanded(true)
      } else {
        toast.error('Failed to load photo')
      }
    } catch {
      toast.error('Failed to load photo')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    const res = await fetch('/api/r2/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: r2Key }),
    })
    setDeleting(false)
    if (res.ok) { toast.success('Photo deleted'); onDelete() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete photo') }
  }

  return (
    <div>
      {!expanded ? (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
            <Camera className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">{r2Key.split('/').pop()}</p>
            <p className="text-xs text-gray-400">Stored in R2</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={loadUrl} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'View'}
            </Button>
            {canDelete && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={alt}
              className="rounded-xl max-h-80 w-full object-contain bg-gray-50 border"
            />
          )}
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setExpanded(false)}>Collapse</Button>
            {canDelete && onDelete && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><X className="w-3.5 h-3.5 mr-1" />Delete</>}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

