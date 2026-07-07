'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import useSWR, { mutate } from 'swr'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileDown, Loader2, Pen, CheckCircle, ExternalLink, RotateCcw, ChevronDown, ChevronRight, OctagonX, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'
import { DEFAULT_POLICE_SERVICE_NAME, DEFAULT_POLICE_LEGAL_NOTE } from '@/lib/police-defaults'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type SearchLog = {
  id: string
  searchType: 'register_by_date' | 'person' | 'goods'
  queryText: string
  resultCount: number
  createdAt: string
}

type PoliceVisit = {
  id: string
  visitDate: string
  officerName: string
  rank?: string | null
  badgeNumber?: string | null
  stationName?: string | null
  status: 'active' | 'completed' | 'expired'
  startedAt?: string | null
  signedAt?: string | null
  visitReason?: string | null
  launchedByName?: string | null
  registerUrl?: string | null
  signatureUrl?: string | null
  notes?: string | null
  createdAt: string
  searchLogs?: SearchLog[]
}

const SEARCH_TYPE_LABELS: Record<SearchLog['searchType'], string> = {
  register_by_date: 'Register by date',
  person:           'Person search',
  goods:            'Goods search',
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
      tab === 'Visit History' ? '/api/police-visits?limit=50' : null,
      fetcher
    )

  const { data: settings } = useSWR<Record<string, string | undefined>>('/api/settings', fetcher)
  const serviceName = settings?.police_service_name ?? DEFAULT_POLICE_SERVICE_NAME
  const legalNote   = settings?.police_legal_note   ?? DEFAULT_POLICE_LEGAL_NOTE

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
      mutate('/api/police-visits?limit=50')
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
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 10,
                      padding: '1px 6px',
                      background: '#E0E0E0',
                      border: '1px solid #999',
                      borderRadius: 2,
                      cursor: loading || !date || !officerName.trim() ? 'not-allowed' : 'pointer',
                      opacity: loading || !date || !officerName.trim() ? 0.6 : 1,
                      alignSelf: 'flex-start',
                      color: '#212529',
                    }}
                    onMouseEnter={(e) => { if (!loading && date && officerName.trim()) e.currentTarget.style.background = '#D0D0D0' }}
                    onMouseLeave={(e) => { if (!loading && date && officerName.trim()) e.currentTarget.style.background = '#E0E0E0' }}
                  >
                    {loading
                      ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />Generating PDF…</>
                      : <><FileDown style={{ width: 9, height: 9 }} />Generate &amp; Download PDF</>}
                  </button>
                </div>
              </div>

              {/* Legal note (configurable in Settings → Police Register) */}
              <div style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2, padding: '8px 12px', fontSize: 11 }}>
                <p style={{ fontWeight: 700, color: colors.process, margin: '0 0 3px' }}>Legal requirement — {serviceName}</p>
                <p style={{ color: colors.processHover, margin: 0 }}>{legalNote}</p>
              </div>

              {/* Officer portal pointer */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #D0D0D0', borderRadius: 2, padding: '8px 12px' }}>
                <ShieldCheck style={{ width: 14, height: 14, color: '#1B3A6B', flexShrink: 0 }} />
                <p style={{ fontSize: 11, color: '#6C757D', margin: 0 }}>
                  Visiting officers can search the register themselves at the{' '}
                  <a href="/police" style={{ color: colors.process, fontWeight: 600 }}>Officer Portal</a>
                  {' '}— each session is logged and signed.
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
              <VisitHistoryTable visits={visitsData.visits} />
            )
          )}
        </div>
      </div>

      {sigDialogOpen && pendingVisitId && (
        <SignatureDialog
          visitId={pendingVisitId}
          onClose={() => { setSigDialogOpen(false); setPendingVisitId(null) }}
          onSaved={() => { setSigDialogOpen(false); setPendingVisitId(null); mutate('/api/police-visits?limit=50'); toast.success('Signature saved') }}
        />
      )}
    </div>
  )
}

// ─── Visit History table ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PoliceVisit['status'] }) {
  const style: Record<PoliceVisit['status'], { bg: string; fg: string; label: string }> = {
    active:    { bg: '#E7F1FF', fg: '#185ABD', label: 'Active' },
    completed: { bg: '#E6F4EA', fg: '#1C8743', label: 'Completed' },
    expired:   { bg: '#FDECEA', fg: '#DC3545', label: 'Expired' },
  }
  const s = style[status]
  return (
    <span style={{ display: 'inline-flex', padding: '1px 8px', borderRadius: 3, fontSize: 11, fontWeight: 700, background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}

function VisitHistoryTable({ visits }: { visits: PoliceVisit[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [forceEnding, setForceEnding] = useState<string | null>(null)

  async function handleForceEnd(visitId: string) {
    if (forceEnding) return
    setForceEnding(visitId)
    try {
      const res = await fetch(`/api/police-visits/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_end' }),
      })
      if (res.ok) {
        toast.success('Inspection session ended')
        mutate('/api/police-visits?limit=50')
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string }
        toast.error(j.error ?? 'Failed to end session')
      }
    } finally {
      setForceEnding(null)
    }
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
        <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
          {['', 'Date', 'Officer', 'Badge', 'Station', 'Status', 'Searches', 'Signature', 'Certificate', ''].map((h, i) => (
            <th key={i} style={TH}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visits.map((v, i) => {
          const isOpen = expanded === v.id
          const logs = v.searchLogs ?? []
          return (
            <FragmentRow key={v.id}>
              <tr
                onClick={() => setExpanded(isOpen ? null : v.id)}
                style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: isOpen ? 'none' : '1px solid #F0F0F0', height: 30, cursor: 'pointer' }}
              >
                <td style={{ ...TD, width: 24 }}>
                  {isOpen ? <ChevronDown style={{ width: 12, height: 12, color: '#6C757D' }} /> : <ChevronRight style={{ width: 12, height: 12, color: '#6C757D' }} />}
                </td>
                <td style={{ ...TD, whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {new Date(v.visitDate).toLocaleDateString('en-ZA')}
                </td>
                <td style={TD}>{v.rank ? `${v.rank} ` : ''}{v.officerName}</td>
                <td style={{ ...TD, color: '#6C757D', fontSize: 11 }}>{v.badgeNumber ?? '—'}</td>
                <td style={{ ...TD, color: '#6C757D', fontSize: 11 }}>{v.stationName ?? '—'}</td>
                <td style={TD}><StatusBadge status={v.status} /></td>
                <td style={{ ...TD, textAlign: 'center' }}>{logs.length}</td>
                <td style={TD}>
                  {v.signatureUrl ? (
                    <a href={v.signatureUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.process, textDecoration: 'none' }}>
                      <ExternalLink style={{ width: 11, height: 11 }} /> View
                    </a>
                  ) : v.status === 'active' ? (
                    <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.warningBg, color: colors.warning }}>Pending</span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#6C757D' }}>—</span>
                  )}
                </td>
                <td style={TD}>
                  <a
                    href={`/api/police-visits/${v.id}/certificate`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.process, textDecoration: 'none' }}
                  >
                    <FileDown style={{ width: 11, height: 11 }} /> PDF
                  </a>
                </td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                  {v.status === 'active' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleForceEnd(v.id) }}
                      disabled={forceEnding === v.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 600, padding: '2px 8px',
                        background: '#FDECEA', color: '#DC3545',
                        border: '1px solid #DC3545', borderRadius: 2,
                        cursor: forceEnding === v.id ? 'wait' : 'pointer',
                      }}
                    >
                      {forceEnding === v.id
                        ? <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" />
                        : <OctagonX style={{ width: 10, height: 10 }} />}
                      Force End
                    </button>
                  )}
                </td>
              </tr>
              {isOpen && (
                <tr style={{ background: '#F8F9FB', borderBottom: '1px solid #E0E0E0' }}>
                  <td colSpan={10} style={{ padding: '10px 16px 12px 34px' }}>
                    <div style={{ display: 'flex', gap: 24, marginBottom: logs.length ? 8 : 0, flexWrap: 'wrap' }}>
                      <MetaItem label="Reason"      value={v.visitReason ? v.visitReason.replace(/_/g, ' ') : '—'} />
                      <MetaItem label="Started"     value={v.startedAt ? new Date(v.startedAt).toLocaleString('en-ZA') : '—'} />
                      <MetaItem label="Signed"      value={v.signedAt ? new Date(v.signedAt).toLocaleString('en-ZA') : v.status === 'expired' ? 'Not signed (expired)' : '—'} />
                      <MetaItem label="Launched by" value={v.launchedByName ?? '—'} />
                      {v.notes && <MetaItem label="Notes" value={v.notes} />}
                    </div>
                    {logs.length === 0 ? (
                      <p style={{ fontSize: 11, color: '#6C757D', margin: 0 }}>No searches were performed during this visit.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #E0E0E0' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                            {['Time', 'Search Type', 'Query', 'Results'].map((h) => (
                              <th key={h} style={{ ...TH, height: 24 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((l) => (
                            <tr key={l.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                              <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: 11 }}>
                                {new Date(l.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ ...TD, fontSize: 11, fontWeight: 600 }}>{SEARCH_TYPE_LABELS[l.searchType]}</td>
                              <td style={{ ...TD, fontSize: 11 }}>{l.queryText}</td>
                              <td style={{ ...TD, fontSize: 11, textAlign: 'center' }}>{l.resultCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </FragmentRow>
          )
        })}
      </tbody>
    </table>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 11 }}>
      <span style={{ fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10 }}>{label}: </span>
      <span style={{ color: '#212529' }}>{value}</span>
    </span>
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

        <div className="rounded overflow-hidden bg-white" style={{ border: `1px solid ${colors.border}` }}>
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
          <button
            onClick={clearCanvas}
            disabled={saving}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              color: '#212529',
            }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#E0E0E0' }}
          >
            <RotateCcw style={{ width: 9, height: 9 }} /> Clear
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                color: '#212529',
              }}
              onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#E0E0E0' }}
            >
              Skip
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasStrokes}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: saving || !hasStrokes ? 'not-allowed' : 'pointer',
                opacity: saving || !hasStrokes ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                color: '#212529',
              }}
              onMouseEnter={(e) => { if (!saving && hasStrokes) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!saving && hasStrokes) e.currentTarget.style.background = '#E0E0E0' }}
            >
              {saving
                ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />Saving…</>
                : <><CheckCircle style={{ width: 9, height: 9 }} />Save Signature</>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
