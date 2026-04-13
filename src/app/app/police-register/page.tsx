'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
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

  const [pendingVisitId, setPendingVisitId] = useState<string | null>(null)
  const [sigDialogOpen, setSigDialogOpen]   = useState(false)

  const { data: visitsData, isLoading: visitsLoading } =
    useSWR<{ visits: PoliceVisit[]; total: number }>(
      tab === 'Visit History' ? '/api/police-visits?limit=20' : null,
      fetcher
    )

  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: '#6C757D' }}>
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

    const res = await fetch(`/api/police-register?date=${date}`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError((j as { error?: string }).error ?? 'Failed to generate register')
      setLoading(false)
      return
    }

    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `police-register-${date}.pdf`
    a.click()
    URL.revokeObjectURL(url)

    const visitRes = await fetch('/api/police-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitDate: date,
        officerName: officerName.trim(),
        badgeNumber: badgeNumber.trim() || undefined,
        stationName: stationName.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
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
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="flex items-center gap-2 shrink-0">
        <ShieldCheck className="w-5 h-5" style={{ color: '#185ABD' }} />
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Police Register</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>
            Daily purchase register — Second-Hand Goods Act (Act 6 of 2009)
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 shrink-0" style={{ borderBottom: '1px solid #E0E0E0' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors"
            style={tab === t
              ? { borderColor: '#185ABD', color: '#185ABD' }
              : { borderColor: 'transparent', color: '#6C757D' }}
          >
            {t === 'Generate Register' ? <FileDown className="w-4 h-4" /> : <History className="w-4 h-4" />}
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'Generate Register' && (
          <div className="max-w-xl space-y-4 pb-6">
            <div className="rounded-lg p-5 space-y-4 bg-white" style={{ border: '1px solid #E0E0E0' }}>
              <h2 className="font-semibold" style={{ color: '#212529' }}>Officer Details</h2>

              <div>
                <Label htmlFor="reg-date" style={{ color: '#212529' }}>Register Date</Label>
                <Input id="reg-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="mt-1 w-48 border-[#E0E0E0]" />
              </div>

              <div>
                <Label htmlFor="officer-name" style={{ color: '#212529' }}>
                  Officer Name <span style={{ color: '#C0392B' }}>*</span>
                </Label>
                <Input id="officer-name" value={officerName} onChange={(e) => setOfficer(e.target.value)} className="mt-1 border-[#E0E0E0]" placeholder="Constable J. Nkosi" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="badge-no" style={{ color: '#212529' }}>Badge / Force Number</Label>
                  <Input id="badge-no" value={badgeNumber} onChange={(e) => setBadge(e.target.value)} className="mt-1 border-[#E0E0E0]" placeholder="12345" />
                </div>
                <div>
                  <Label htmlFor="station" style={{ color: '#212529' }}>Police Station</Label>
                  <Input id="station" value={stationName} onChange={(e) => setStation(e.target.value)} className="mt-1 border-[#E0E0E0]" placeholder="Pretoria Central" />
                </div>
              </div>

              <div>
                <Label htmlFor="visit-notes" style={{ color: '#212529' }}>Notes (optional)</Label>
                <Textarea id="visit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 border-[#E0E0E0]" rows={2} placeholder="Routine inspection, routine audit, etc." />
              </div>

              {error && (
                <p className="text-sm rounded px-3 py-2" style={{ color: '#C0392B', background: '#FEF2F2' }}>{error}</p>
              )}

              <button
                onClick={handleDownload}
                disabled={loading || !date || !officerName.trim()}
                className="flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: '#185ABD' }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#1249A0')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.background = '#185ABD')}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating PDF…</>
                  : <><FileDown className="w-4 h-4" />Generate &amp; Download PDF</>}
              </button>
            </div>

            <div className="rounded-lg p-4 text-sm space-y-1" style={{ background: '#EBF3FC', border: '1px solid #C7DDF5', color: '#185ABD' }}>
              <p className="font-semibold">Legal requirement</p>
              <p style={{ color: '#1249A0' }}>
                This register must be kept for at least 5 years and made available to the South African Police Service on request.
                Each page must be signed by the dealer.
              </p>
            </div>
          </div>
        )}

        {tab === 'Visit History' && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E0E0E0' }}>
            {visitsLoading ? (
              <div className="flex items-center justify-center p-10" style={{ color: '#6C757D' }}>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
              </div>
            ) : !visitsData?.visits?.length ? (
              <div className="text-center p-10 text-sm" style={{ color: '#6C757D' }}>No visits recorded yet</div>
            ) : (
              <table className="w-full bg-white">
                <thead style={{ background: '#F8F9FA', borderBottom: '1px solid #E0E0E0' }}>
                  <tr>
                    {['Date', 'Officer', 'Badge', 'Station', 'Signature', 'Register', 'Recorded'].map((h) => (
                      <th key={h} className="text-left px-4 py-2" style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visitsData.visits.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: i < visitsData.visits.length - 1 ? '1px solid #F1F3F4' : 'none' }}>
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ fontSize: 12, color: '#212529' }}>
                        {new Date(v.visitDate).toLocaleDateString('en-ZA')}
                      </td>
                      <td className="px-4 py-2.5" style={{ fontSize: 12, color: '#212529' }}>{v.officerName}</td>
                      <td className="px-4 py-2.5" style={{ fontSize: 11, color: '#6C757D' }}>{v.badgeNumber ?? '—'}</td>
                      <td className="px-4 py-2.5" style={{ fontSize: 11, color: '#6C757D' }}>{v.stationName ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {v.signatureUrl ? (
                          <a href={v.signatureUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: '#185ABD' }}>
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#FFFBEB', color: '#C9A020' }}>Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {v.registerUrl ? (
                          <a href={v.registerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: '#185ABD' }}>
                            <ExternalLink className="w-3 h-3" /> View PDF
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, color: '#6C757D' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ fontSize: 11, color: '#6C757D' }}>
                        {new Date(v.createdAt).toLocaleDateString('en-ZA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

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
  const [drawing, setDrawing]    = useState(false)
  const [hasStrokes, setStrokes] = useState(false)
  const [saving, setSaving]      = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

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
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Failed to capture signature')

      const urlRes = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'police_signature', referenceId: visitId, contentType: 'image/png', fileSize: blob.size }),
      })
      if (!urlRes.ok) throw new Error('Failed to get upload URL')
      const { uploadUrl, key } = await urlRes.json() as { uploadUrl: string; key: string }

      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/png' } })
      if (!uploadRes.ok) throw new Error('Upload failed')

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
        <p className="text-sm" style={{ color: '#6C757D' }}>Ask the officer to sign below using a mouse or touchscreen.</p>

        <div className="rounded-lg overflow-hidden bg-white" style={{ border: '1px solid #E0E0E0' }}>
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
            <button
              onClick={handleSave}
              disabled={saving || !hasStrokes}
              className="flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: '#217346' }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.background = '#185A38')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.background = '#217346')}
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                : <><CheckCircle className="w-4 h-4" />Save Signature</>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
