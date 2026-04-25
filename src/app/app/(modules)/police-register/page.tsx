'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileDown, Loader2, Pen, CheckCircle, ExternalLink, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

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

const TABS = [
  { value: 'Generate Register', label: 'Generate Register' },
  { value: 'Visit History',     label: 'Visit History' },
] as const

export default function PoliceRegisterPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const [tab, setTab]             = useState<'Generate Register' | 'Visit History'>('Generate Register')
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
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: colors.textSecondary }}>
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
    <PageShell
      title="Police Register"
      subtitle="Compliance reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={(v) => setTab(v as typeof tab)}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === 'Generate Register' && (
            <div className="max-w-xl mx-auto w-full space-y-4 pb-6">
              <div className="rounded-lg p-5 space-y-4 bg-white" style={{ border: `1px solid ${colors.border}` }}>
                <h2 className="font-semibold" style={{ fontSize: fontSize.md, color: colors.textPrimary }}>Officer Details</h2>

                <div>
                  <Label htmlFor="reg-date" style={{ color: colors.textPrimary }}>Register Date</Label>
                  <Input id="reg-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="mt-1 w-48 border-[#E0E0E0]" />
                </div>

                <div>
                  <Label htmlFor="officer-name" style={{ color: colors.textPrimary }}>
                    Officer Name <span style={{ color: colors.danger }}>*</span>
                  </Label>
                  <Input id="officer-name" value={officerName} onChange={(e) => setOfficer(e.target.value)} className="mt-1 border-[#E0E0E0]" placeholder="Constable J. Nkosi" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="badge-no" style={{ color: colors.textPrimary }}>Badge / Force Number</Label>
                    <Input id="badge-no" value={badgeNumber} onChange={(e) => setBadge(e.target.value)} className="mt-1 border-[#E0E0E0]" placeholder="12345" />
                  </div>
                  <div>
                    <Label htmlFor="station" style={{ color: colors.textPrimary }}>Police Station</Label>
                    <Input id="station" value={stationName} onChange={(e) => setStation(e.target.value)} className="mt-1 border-[#E0E0E0]" placeholder="Pretoria Central" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="visit-notes" style={{ color: colors.textPrimary }}>Notes (optional)</Label>
                  <Textarea id="visit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 border-[#E0E0E0]" rows={2} placeholder="Routine inspection, routine audit, etc." />
                </div>

                {error && (
                  <p className="text-sm rounded px-3 py-2" style={{ color: colors.danger, background: colors.dangerBg }}>{error}</p>
                )}

                <button
                  onClick={handleDownload}
                  disabled={loading || !date || !officerName.trim()}
                  className="flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: colors.process }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#1249A0')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.background = colors.process)}
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Generating PDF…</>
                    : <><FileDown className="w-4 h-4" />Generate &amp; Download PDF</>}
                </button>
              </div>

              <div className="rounded-lg p-4 text-sm space-y-1" style={{ background: colors.processBg, border: '1px solid #C7DDF5', color: colors.process }}>
                <p className="font-semibold">Legal requirement</p>
                <p style={{ color: '#1249A0' }}>
                  This register must be kept for at least 5 years and made available to the Eswatini Police Service (EPS) on request.
                  Each page must be signed by the dealer.
                </p>
              </div>
            </div>
          )}

          {tab === 'Visit History' && (
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              {visitsLoading ? (
                <div className="flex items-center justify-center p-10" style={{ color: colors.textSecondary }}>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
                </div>
              ) : !visitsData?.visits?.length ? (
                <div className="text-center p-10 text-sm" style={{ color: colors.textSecondary }}>No visits recorded yet</div>
              ) : (
                <table className="w-full bg-white">
                  <thead style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}>
                    <tr>
                      {['Date', 'Officer', 'Badge', 'Station', 'Signature', 'Register', 'Recorded'].map((h) => (
                        <th key={h} className="text-left px-4 py-2" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visitsData.visits.map((v, i) => (
                      <tr key={v.id} style={{ borderBottom: i < visitsData.visits.length - 1 ? `1px solid ${colors.neutralBg}` : 'none' }}>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
                          {new Date(v.visitDate).toLocaleDateString('en-ZA')}
                        </td>
                        <td className="px-4 py-2.5" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{v.officerName}</td>
                        <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{v.badgeNumber ?? '—'}</td>
                        <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{v.stationName ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          {v.signatureUrl ? (
                            <a href={v.signatureUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: colors.process }}>
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.warningBg, color: colors.warning }}>Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {v.registerUrl ? (
                            <a href={v.registerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: colors.process }}>
                              <ExternalLink className="w-3 h-3" /> View PDF
                            </a>
                          ) : (
                            <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
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
      </div>

      {sigDialogOpen && pendingVisitId && (
        <SignatureDialog
          visitId={pendingVisitId}
          onClose={() => { setSigDialogOpen(false); setPendingVisitId(null) }}
          onSaved={() => { setSigDialogOpen(false); setPendingVisitId(null); mutate('/api/police-visits?limit=20'); toast.success('Signature saved') }}
        />
      )}
    </PageShell>
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

      const fd = new FormData()
      fd.append('context', 'police_signature')
      fd.append('referenceId', visitId)
      fd.append('file', blob, 'signature.png')

      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { key } = await uploadRes.json() as { key: string }

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
        <p className="text-sm" style={{ color: colors.textSecondary }}>Ask the officer to sign below using a mouse or touchscreen.</p>

        <div className="rounded-lg overflow-hidden bg-white" style={{ border: `1px solid ${colors.border}` }}>
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
              style={{ background: colors.action }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.background = '#185A38')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.background = colors.action)}
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
