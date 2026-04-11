'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileDown, Loader2, ShieldCheck, History, Pen, CheckCircle, ExternalLink, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PoliceVisit = {
  id: string
  visitDate: string
  officerName: string
  badgeNumber?: string
  stationName?: string
  registerUrl?: string
  signatureUrl?: string
  notes?: string
  createdAt: string
}

const TABS = ['Generate Register', 'Visit History'] as const

export default function PoliceRegisterPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const [tab, setTab]             = useState<typeof TABS[number]>('Generate Register')
  const [date, setDate]           = useState(today)
  const [officerName, setOfficer] = useState('')
  const [badgeNumber, setBadge]   = useState('')
  const [stationName, setStation] = useState('')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // After generate — show signature pad
  const [pendingVisitId, setPendingVisitId]   = useState<string | null>(null)
  const [sigDialogOpen, setSigDialogOpen]     = useState(false)
  const [sigSaving, setSigSaving]             = useState(false)

  const { data: visitsData, isLoading: visitsLoading } =
    useSWR<{ visits: PoliceVisit[]; total: number }>(
      tab === 'Visit History' ? '/api/police-visits?limit=20' : null,
      fetcher
    )

  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Access restricted to managers and administrators.
      </div>
    )
  }

  async function handleDownload() {
    if (!date || !officerName.trim()) {
      setError('Officer name and date are required')
      return
    }
    setLoading(true)
    setError(null)

    // 1. Generate PDF
    const res = await fetch(`/api/police-register?date=${date}`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError((j as { error?: string }).error ?? 'Failed to generate register')
      setLoading(false)
      return
    }

    // 2. Trigger browser download
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `police-register-${date}.pdf`
    a.click()
    URL.revokeObjectURL(url)

    // 3. Record the police visit
    const visitRes = await fetch('/api/police-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitDate: date, officerName: officerName.trim(), badgeNumber: badgeNumber.trim() || undefined, stationName: stationName.trim() || undefined, notes: notes.trim() || undefined }),
    })
    setLoading(false)

    if (visitRes.ok) {
      const j = await visitRes.json() as { visit: PoliceVisit }
      toast.success('Visit recorded. You can now capture the officer\'s signature.')
      setPendingVisitId(j.visit.id)
      setSigDialogOpen(true)
      mutate('/api/police-visits?limit=20')
    } else {
      toast.warning('PDF downloaded but failed to record visit')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-blue-700" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Police Register</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Daily purchase register — Second-Hand Goods Act (Act 6 of 2009)
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'Generate Register' ? <FileDown className="w-4 h-4" /> : <History className="w-4 h-4" />}
            {t}
          </button>
        ))}
      </div>

      {tab === 'Generate Register' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Officer Details</h2>

            <div>
              <Label htmlFor="reg-date">Register Date</Label>
              <Input id="reg-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="mt-1 w-48" />
            </div>

            <div>
              <Label htmlFor="officer-name">Officer Name <span className="text-red-500">*</span></Label>
              <Input id="officer-name" value={officerName} onChange={(e) => setOfficer(e.target.value)} className="mt-1" placeholder="Constable J. Nkosi" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="badge-no">Badge / Force Number</Label>
                <Input id="badge-no" value={badgeNumber} onChange={(e) => setBadge(e.target.value)} className="mt-1" placeholder="12345" />
              </div>
              <div>
                <Label htmlFor="station">Police Station</Label>
                <Input id="station" value={stationName} onChange={(e) => setStation(e.target.value)} className="mt-1" placeholder="Pretoria Central" />
              </div>
            </div>

            <div>
              <Label htmlFor="visit-notes">Notes (optional)</Label>
              <Textarea id="visit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} placeholder="Routine inspection, routine audit, etc." />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
            )}

            <Button onClick={handleDownload} disabled={loading || !date || !officerName.trim()} className="w-full sm:w-auto">
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating PDF...</>
                : <><FileDown className="w-4 h-4 mr-2" />Generate & Download PDF</>}
            </Button>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800 space-y-1">
            <p className="font-semibold">Legal requirement</p>
            <p>
              This register must be kept for at least 5 years and made available to the South African Police Service on request.
              Each page must be signed by the dealer.
            </p>
          </div>
        </div>
      )}

      {tab === 'Visit History' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {visitsLoading ? (
            <div className="flex items-center justify-center p-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          ) : !visitsData?.visits?.length ? (
            <div className="text-center p-10 text-gray-400">No visits recorded yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Date', 'Officer', 'Badge', 'Station', 'Signature', 'Register', 'Recorded'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visitsData.visits.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {new Date(v.visitDate).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-4 py-3">{v.officerName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.badgeNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.stationName ?? '—'}</td>
                    <td className="px-4 py-3">
                      {v.signatureUrl ? (
                        <a href={v.signatureUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-700 text-xs">Pending</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {v.registerUrl ? (
                        <a href={v.registerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <ExternalLink className="w-3 h-3" /> View PDF
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(v.createdAt).toLocaleDateString('en-ZA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Signature capture dialog */}
      {sigDialogOpen && pendingVisitId && (
        <SignatureDialog
          visitId={pendingVisitId}
          onClose={() => { setSigDialogOpen(false); setPendingVisitId(null) }}
          onSaved={() => { setSigDialogOpen(false); setPendingVisitId(null); mutate('/api/police-visits?limit=20'); toast.success('Signature saved') }}
        />
      )}
    </div>
  )
}

// ─── Signature Capture Dialog ─────────────────────────────────────────────────

function SignatureDialog({
  visitId,
  onClose,
  onSaved,
}: {
  visitId: string
  onClose: () => void
  onSaved: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing]   = useState(false)
  const [hasStrokes, setStrokes] = useState(false)
  const [saving, setSaving]     = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Init canvas background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]!
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    setDrawing(true)
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return
    const pos = getPos(e, canvas)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setStrokes(true)
  }

  function stopDraw() { setDrawing(false); lastPos.current = null }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setStrokes(false)
  }

  async function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes) return
    setSaving(true)

    try {
      // Convert canvas to PNG blob
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Failed to capture signature')

      // Get presigned upload URL
      const urlRes = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'police_signature', referenceId: visitId, contentType: 'image/png', fileSize: blob.size }),
      })
      if (!urlRes.ok) throw new Error('Failed to get upload URL')
      const { uploadUrl, key } = await urlRes.json() as { uploadUrl: string; key: string }

      // Upload directly to R2
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/png' } })
      if (!uploadRes.ok) throw new Error('Upload failed')

      // Save key on visit record
      const patchRes = await fetch(`/api/police-visits/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureR2Key: key }),
      })
      if (!patchRes.ok) throw new Error('Failed to save signature key')

      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save signature')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pen className="w-4 h-4" /> Capture Officer Signature
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">Ask the officer to sign below using a mouse or touchscreen.</p>

        <div className="border rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            width={480}
            height={200}
            className="w-full touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={clearCanvas} disabled={saving}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Clear
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Skip</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleSave} disabled={saving || !hasStrokes}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><CheckCircle className="w-4 h-4 mr-2" />Save Signature</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
