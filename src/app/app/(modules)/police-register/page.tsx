'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileDown, Loader2, Pen, CheckCircle, ExternalLink, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'

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

const inp: React.CSSProperties = {
  height: 26, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 7px',
  fontSize: 12, color: '#212529', outline: 'none',
  background: '#fff', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 3,
}
const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 28,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '0 10px', fontSize: 12, color: '#212529' }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, fontSize: 13, color: colors.textSecondary }}>
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
        visitDate:   date,
        officerName: officerName.trim(),
        badgeNumber: badgeNumber.trim() || undefined,
        stationName: stationName.trim() || undefined,
        notes:       notes.trim() || undefined,
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar with inline tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>Police Register</span>
          <span style={{ fontSize: 11, color: '#6C757D' }}>Compliance reports</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 1, background: '#B8B8B8', borderRadius: 3, padding: 1 }}>
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                style={{
                  height: 22, padding: '0 10px', fontSize: 11, fontWeight: 600,
                  borderRadius: 2, border: 'none', cursor: 'pointer',
                  background: tab === t.value ? '#fff' : 'transparent',
                  color: tab === t.value ? '#1B3A6B' : '#6C757D',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: tab === 'Generate Register' ? 16 : 0 }}>

          {tab === 'Generate Register' && (
            <div style={{ maxWidth: 520 }}>
              {/* Officer Details card */}
              <div style={{ background: '#fff', border: '1px solid #D0D0D0', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '4px 10px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Officer Details</span>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={lbl}>Register Date</label>
                    <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 160 }} />
                  </div>
                  <div>
                    <label style={lbl}>Officer Name <span style={{ color: colors.danger }}>*</span></label>
                    <input value={officerName} onChange={(e) => setOfficer(e.target.value)} placeholder="Constable J. Nkosi" style={inp} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lbl}>Badge / Force Number</label>
                      <input value={badgeNumber} onChange={(e) => setBadge(e.target.value)} placeholder="12345" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Police Station</label>
                      <input value={stationName} onChange={(e) => setStation(e.target.value)} placeholder="Pretoria Central" style={inp} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Routine inspection, routine audit, etc."
                      rows={2}
                      style={{ ...inp, height: 'auto', padding: '5px 7px', resize: 'vertical' }}
                    />
                  </div>
                  {error && (
                    <p style={{ fontSize: 12, padding: '6px 10px', borderRadius: 2, color: colors.danger, background: colors.dangerBg, margin: 0 }}>{error}</p>
                  )}
                  <button
                    onClick={handleDownload}
                    disabled={loading || !date || !officerName.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', fontSize: 12, fontWeight: 600, borderRadius: 2, background: colors.process, border: 'none', color: '#fff', cursor: loading || !date || !officerName.trim() ? 'not-allowed' : 'pointer', opacity: loading || !date || !officerName.trim() ? 0.6 : 1, alignSelf: 'flex-start' }}
                    onMouseEnter={(e) => !loading && (e.currentTarget.style.background = colors.processHover)}
                    onMouseLeave={(e) => !loading && (e.currentTarget.style.background = colors.process)}
                  >
                    {loading
                      ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Generating PDF…</>
                      : <><FileDown style={{ width: 13, height: 13 }} />Generate &amp; Download PDF</>}
                  </button>
                </div>
              </div>

              {/* Legal note */}
              <div style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2, padding: '8px 12px', fontSize: 11 }}>
                <p style={{ fontWeight: 700, color: colors.process, margin: '0 0 3px' }}>Legal requirement</p>
                <p style={{ color: colors.processHover, margin: 0 }}>
                  This register must be kept for at least 5 years and made available to the Eswatini Police Service (EPS) on request.
                  Each page must be signed by the dealer.
                </p>
              </div>
            </div>
          )}

          {tab === 'Visit History' && (
            visitsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12, gap: 8 }}>
                <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Loading…
              </div>
            ) : !visitsData?.visits?.length ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12 }}>
                No visits recorded yet
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                    {['Date', 'Officer', 'Badge', 'Station', 'Signature', 'Register', 'Recorded'].map((h) => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visitsData.visits.map((v, i) => (
                    <tr key={v.id} style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: '1px solid #F0F0F0', height: 30 }}>
                      <td style={{ ...TD, whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {new Date(v.visitDate).toLocaleDateString('en-ZA')}
                      </td>
                      <td style={TD}>{v.officerName}</td>
                      <td style={{ ...TD, color: '#6C757D', fontSize: 11 }}>{v.badgeNumber ?? '—'}</td>
                      <td style={{ ...TD, color: '#6C757D', fontSize: 11 }}>{v.stationName ?? '—'}</td>
                      <td style={TD}>
                        {v.signatureUrl ? (
                          <a href={v.signatureUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.process, textDecoration: 'none' }}>
                            <ExternalLink style={{ width: 11, height: 11 }} /> View
                          </a>
                        ) : (
                          <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.warningBg, color: colors.warning }}>Pending</span>
                        )}
                      </td>
                      <td style={TD}>
                        {v.registerUrl ? (
                          <a href={v.registerUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.process, textDecoration: 'none' }}>
                            <ExternalLink style={{ width: 11, height: 11 }} /> View PDF
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, color: '#6C757D' }}>—</span>
                        )}
                      </td>
                      <td style={{ ...TD, color: '#6C757D', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {new Date(v.createdAt).toLocaleDateString('en-ZA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
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
              onMouseEnter={(e) => !saving && (e.currentTarget.style.background = colors.actionHover)}
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
