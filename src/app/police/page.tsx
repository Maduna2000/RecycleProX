'use client'

/**
 * Police Register — Officer Portal (/police)
 *
 * Full-screen, staff-launched portal. A police officer registers their visit
 * (name, rank, service number, station, reason), which opens an active
 * inspection session. They can then search the purchase register by date,
 * person, or goods — every search is logged server-side against the visit.
 * Ending the session captures the officer's digital signature and offers an
 * inspection certificate PDF.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import {
  ShieldCheck, Loader2, Search, FileDown, Pen, CheckCircle, RotateCcw,
  ArrowLeft, Clock, AlertTriangle, X, User as UserIcon, Package, CalendarDays,
} from 'lucide-react'
import { POLICE_VISIT_REASONS, VISIT_REASON_LABELS } from '@/lib/schemas/police'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Types (mirror service layer outputs) ─────────────────────────────────────

type Visit = {
  id: string
  officerName: string
  rank?: string | null
  badgeNumber?: string | null
  stationName?: string | null
  status: 'active' | 'completed' | 'expired'
  startedAt?: string | null
  searchLogs?: { id: string }[]
}

type RegisterRow = {
  purchaseId: string
  createdAt: string
  refNumber: string
  supplierName: string
  idNumber: string | null
  dateOfBirth: string | null
  address: string
  blacklisted: boolean
  lines: { productName: string; quantity: string; unit: string }[]
  totalAmount: string
  idPhotoUrl: string | null
  photoUrls: string[]
}

type PersonRow = {
  customerId: string
  fullName: string
  idNumber: string | null
  phone: string
  address: string | null
  blacklisted: boolean
  blacklistReason: string | null
  idPhotoUrl: string | null
  purchaseCount: number
  lastPurchaseAt: string | null
}

type PersonDetail = {
  customer: {
    customerId: string
    fullName: string
    idNumber: string | null
    dateOfBirth: string | null
    gender: string | null
    nationality: string | null
    phone: string
    email: string | null
    physicalAddress: string | null
    postalAddress: string | null
    blacklisted: boolean
    blacklistReason: string | null
    idPhotoUrl: string | null
  }
  purchases: {
    purchaseId: string
    refNumber: string
    createdAt: string
    totalAmount: string
    lines: { productName: string; quantity: string; unit: string }[]
    photoUrls: string[]
  }[]
}

type GoodsRow = {
  purchaseId: string
  refNumber: string
  createdAt: string
  supplierName: string
  idNumber: string | null
  blacklisted: boolean
  quantity: string
  unit: string
  lineTotal: string
  photoUrls: string[]
}

type Product = { id: string; name: string; unit: string }

type SettingsMap = Record<string, string | undefined>

// ─── Shared styles (house style) ──────────────────────────────────────────────

const NAVY = '#1B3A6B'

const inp: React.CSSProperties = {
  height: 30, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 8px',
  fontSize: 13, color: '#212529', outline: 'none',
  background: '#fff', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 3,
}
const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 30,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '4px 10px', fontSize: 12, color: '#212529' }

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, padding: '7px 16px',
  background: NAVY, color: '#fff', border: 'none',
  borderRadius: 3, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 11, fontWeight: 600, padding: '5px 12px',
  background: '#E0E0E0', color: '#212529', border: '1px solid #999',
  borderRadius: 2, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  background: '#DC3545', color: '#fff', border: '1px solid #C82333',
}

function todayYMD(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}
function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString('en-ZA') : '—'
}

const IDLE_TIMEOUT_MS = 15 * 60_000
const STORAGE_KEY = 'police-visit-id'

// ─── Page ─────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'begin' | 'active' | 'done' | 'expired'

export default function PolicePortalPage() {
  const { data: settings } = useSWR<SettingsMap>('/api/settings', fetcher)
  const serviceName = settings?.police_service_name ?? 'South African Police Service (SAPS)'
  const legalNote   = settings?.police_legal_note ??
    'This register is kept in terms of the Second-Hand Goods Act 6 of 2009. It must be retained for at least 5 years and produced to the police service on request.'
  const yardName = settings?.yardName ?? 'Renovo Pro'

  const [phase, setPhase] = useState<Phase>('loading')
  const [visit, setVisit] = useState<Visit | null>(null)

  // Restore an active session after a refresh
  useEffect(() => {
    const storedId = sessionStorage.getItem(STORAGE_KEY)
    if (!storedId) { setPhase('begin'); return }
    fetch(`/api/police-visits/${storedId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('not found')
        const v = await res.json() as Visit
        if (v.status === 'active') { setVisit(v); setPhase('active') }
        else { sessionStorage.removeItem(STORAGE_KEY); setPhase('begin') }
      })
      .catch(() => { sessionStorage.removeItem(STORAGE_KEY); setPhase('begin') })
  }, [])

  const handleBegin = useCallback((v: Visit) => {
    sessionStorage.setItem(STORAGE_KEY, v.id)
    setVisit(v)
    setPhase('active')
  }, [])

  const handleSessionInvalid = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setPhase('expired')
  }, [])

  const handleSigned = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setPhase('done')
  }, [])

  const handleReset = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setVisit(null)
    setPhase('begin')
  }, [])

  return (
    <>
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
          height: 46, background: NAVY, flexShrink: 0,
        }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck style={{ width: 16, height: 16, color: '#F2AB1A' }} />
        </div>
        <div>
          <p style={{ margin: 0, color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>Police Register — Officer Portal</p>
          <p style={{ margin: 0, color: '#8BA4D4', fontSize: 10 }}>{yardName}</p>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ color: '#8BA4D4', fontSize: 11 }}>{serviceName}</span>
        {phase !== 'active' && (
          <a
            href="/app/dashboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fff', fontSize: 11, textDecoration: 'none', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3 }}
          >
            <ArrowLeft style={{ width: 11, height: 11 }} /> Exit portal
          </a>
        )}
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {phase === 'loading' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6C757D', fontSize: 13 }}>
            <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> Loading…
          </div>
        )}

        {phase === 'begin' && (
          <BeginInspectionCard serviceName={serviceName} legalNote={legalNote} onBegin={handleBegin} />
        )}

        {phase === 'active' && visit && (
          <ActiveSession
            visit={visit}
            onSessionInvalid={handleSessionInvalid}
            onSigned={handleSigned}
          />
        )}

        {phase === 'expired' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <AlertTriangle style={{ width: 40, height: 40, color: '#B45309' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: '#212529', margin: 0 }}>Inspection session has ended</p>
            <p style={{ fontSize: 12, color: '#6C757D', margin: 0, maxWidth: 420, textAlign: 'center' }}>
              The session expired due to inactivity or was ended by a manager. Register again to continue searching.
            </p>
            <button style={btnPrimary} onClick={handleReset}>Start a new inspection</button>
          </div>
        )}

        {phase === 'done' && visit && (
          <DoneScreen visit={visit} onFinish={handleReset} />
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ height: 26, background: 'rgba(27,58,107,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
          Renovo Pro Management Software · Police Register Module
        </span>
      </footer>
    </>
  )
}

// ─── Begin Inspection ─────────────────────────────────────────────────────────

function BeginInspectionCard({
  serviceName,
  legalNote,
  onBegin,
}: {
  serviceName: string
  legalNote: string
  onBegin: (v: Visit) => void
}) {
  const [officerName, setOfficerName]     = useState('')
  const [rank, setRank]                   = useState('')
  const [badgeNumber, setBadgeNumber]     = useState('')
  const [stationName, setStationName]     = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [visitReason, setVisitReason]     = useState<string>('routine_inspection')
  const [visitNote, setVisitNote]         = useState('')
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const canSubmit =
    officerName.trim().length >= 2 && rank.trim().length >= 2 &&
    badgeNumber.trim().length >= 2 && stationName.trim().length >= 2

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/police-visits/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officerName:   officerName.trim(),
          rank:          rank.trim(),
          badgeNumber:   badgeNumber.trim(),
          stationName:   stationName.trim(),
          contactNumber: contactNumber.trim(),
          visitReason,
          visitNote:     visitNote.trim(),
        }),
      })
      const j = await res.json().catch(() => ({})) as { visit?: Visit; error?: string }
      if (!res.ok || !j.visit) {
        setError(j.error ?? 'Failed to start inspection')
        return
      }
      onBegin(j.visit)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ background: '#fff', border: '1px solid #B0B0B0', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck style={{ width: 15, height: 15, color: NAVY }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Begin Inspection — Officer Registration</span>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6C757D' }}>
              In terms of the applicable second-hand goods legislation, please identify yourself before the register is made available.
            </p>

            <div>
              <label style={lbl}>Full Name <span style={{ color: '#DC3545' }}>*</span></label>
              <input value={officerName} onChange={(e) => setOfficerName(e.target.value)} placeholder="e.g. J. Nkosi" style={inp} autoFocus />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Rank <span style={{ color: '#DC3545' }}>*</span></label>
                <input value={rank} onChange={(e) => setRank(e.target.value)} placeholder="e.g. Constable" style={inp} />
              </div>
              <div>
                <label style={lbl}>Service / Force Number <span style={{ color: '#DC3545' }}>*</span></label>
                <input value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} placeholder="e.g. 7012345-6" style={inp} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Police Station <span style={{ color: '#DC3545' }}>*</span></label>
                <input value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder="e.g. Pretoria Central" style={inp} />
              </div>
              <div>
                <label style={lbl}>Contact Number</label>
                <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Optional" style={inp} />
              </div>
            </div>

            <div>
              <label style={lbl}>Reason for Visit <span style={{ color: '#DC3545' }}>*</span></label>
              <select value={visitReason} onChange={(e) => setVisitReason(e.target.value)} style={{ ...inp, height: 30 }}>
                {POLICE_VISIT_REASONS.map((r) => (
                  <option key={r} value={r}>{VISIT_REASON_LABELS[r]}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={lbl}>Note (optional)</label>
              <textarea
                value={visitNote}
                onChange={(e) => setVisitNote(e.target.value)}
                placeholder="Case number, description of goods sought, etc."
                rows={2}
                style={{ ...inp, height: 'auto', padding: '6px 8px', resize: 'vertical' }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 12, padding: '6px 10px', borderRadius: 2, color: '#DC3545', background: '#FDECEA', margin: 0 }}>{error}</p>
            )}

            <button type="submit" disabled={!canSubmit || loading} style={{ ...btnPrimary, opacity: !canSubmit || loading ? 0.6 : 1, cursor: !canSubmit || loading ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
              {loading
                ? <><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Starting…</>
                : <><ShieldCheck style={{ width: 13, height: 13 }} /> Begin Inspection</>}
            </button>
          </form>
        </div>

        <div style={{ marginTop: 12, background: '#EFF4FB', border: `1px solid ${NAVY}`, borderRadius: 3, padding: '10px 14px' }}>
          <p style={{ fontWeight: 700, color: NAVY, margin: '0 0 3px', fontSize: 11 }}>{serviceName} — legal notice</p>
          <p style={{ color: '#33507E', margin: 0, fontSize: 11 }}>{legalNote}</p>
          <p style={{ color: '#33507E', margin: '6px 0 0', fontSize: 10.5 }}>
            All searches performed during this session are recorded against your visit and appear on the inspection certificate.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Active session ───────────────────────────────────────────────────────────

type SearchTab = 'register' | 'person' | 'goods'

function ActiveSession({
  visit,
  onSessionInvalid,
  onSigned,
}: {
  visit: Visit
  onSessionInvalid: () => void
  onSigned: () => void
}) {
  const [tab, setTab] = useState<SearchTab>('register')
  const [sigOpen, setSigOpen] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const lastActivityRef = useRef(Date.now())
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bumpActivity = useCallback(() => { lastActivityRef.current = Date.now() }, [])

  // Client-side idle watchdog (server enforces the same window independently)
  useEffect(() => {
    function arm() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) onSessionInvalid()
        else arm()
      }, 60_000)
    }
    arm()
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [onSessionInvalid])

  // Elapsed-time ticker
  useEffect(() => {
    function tick() {
      if (!visit.startedAt) return
      const mins = Math.floor((Date.now() - new Date(visit.startedAt).getTime()) / 60_000)
      setElapsed(mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    tick()
    const iv = setInterval(tick, 30_000)
    return () => clearInterval(iv)
  }, [visit.startedAt])

  /** Shared fetch wrapper: bumps activity, catches 409 session-ended. */
  const guardedFetch = useCallback(async (url: string): Promise<Response | null> => {
    const res = await fetch(url)
    if (res.status === 409) { onSessionInvalid(); return null }
    bumpActivity()
    return res
  }, [onSessionInvalid, bumpActivity])

  const TABS: { value: SearchTab; label: string; icon: React.ElementType }[] = [
    { value: 'register', label: 'Register by Date', icon: CalendarDays },
    { value: 'person',   label: 'Person Search',    icon: UserIcon },
    { value: 'goods',    label: 'Goods Search',     icon: Package },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Inspection banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', background: '#FFF7E6', borderBottom: '1px solid #F2AB1A', flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC3545', display: 'inline-block', animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#7A5200' }}>
          Police inspection in progress — {visit.rank ? `${visit.rank} ` : ''}{visit.officerName}
        </span>
        <span style={{ fontSize: 11, color: '#9A7B2D' }}>
          {visit.stationName}{visit.badgeNumber ? ` · No. ${visit.badgeNumber}` : ''}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#9A7B2D' }}>
          <Clock style={{ width: 11, height: 11 }} /> {elapsed}
        </span>
        <div style={{ flex: 1 }} />
        <button style={btnDanger} onClick={() => setSigOpen(true)}>
          <Pen style={{ width: 11, height: 11 }} /> End Inspection &amp; Sign
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 16px 0', flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', fontSize: 12, fontWeight: 600,
              border: '1px solid #B0B0B0', borderBottom: 'none',
              borderRadius: '4px 4px 0 0', cursor: 'pointer',
              background: tab === t.value ? '#fff' : '#DDD',
              color: tab === t.value ? NAVY : '#6C757D',
            }}
          >
            <t.icon style={{ width: 13, height: 13 }} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, margin: '0 16px 16px', background: '#fff', border: '1px solid #B0B0B0', borderRadius: '0 3px 3px 3px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'register' && <RegisterTab visitId={visit.id} guardedFetch={guardedFetch} />}
        {tab === 'person'   && <PersonTab   visitId={visit.id} guardedFetch={guardedFetch} />}
        {tab === 'goods'    && <GoodsTab    visitId={visit.id} guardedFetch={guardedFetch} />}
      </div>

      {sigOpen && (
        <SignatureDialog
          visitId={visit.id}
          onClose={() => setSigOpen(false)}
          onSigned={onSigned}
          onSessionInvalid={onSessionInvalid}
        />
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  )
}

type GuardedFetch = (url: string) => Promise<Response | null>

/**
 * Download a PDF through the session guard (409 ends the session cleanly).
 * Returns an error message, or null on success / session end.
 */
async function downloadPdf(guardedFetch: GuardedFetch, url: string, filename: string): Promise<string | null> {
  const res = await guardedFetch(url)
  if (!res) return null
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { error?: string }
    return j.error ?? 'Download failed'
  }
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objectUrl)
  return null
}

// ─── Register by Date tab ─────────────────────────────────────────────────────

function RegisterTab({ visitId, guardedFetch }: { visitId: string; guardedFetch: GuardedFetch }) {
  const [from, setFrom]       = useState(todayYMD())
  const [to, setTo]           = useState(todayYMD())
  const [rows, setRows]       = useState<RegisterRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [detail, setDetail]   = useState<RegisterRow | null>(null)

  async function handleSearch() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await guardedFetch(`/api/police-search/register?visitId=${visitId}&from=${from}&to=${to}`)
      if (!res) return
      const j = await res.json().catch(() => ({})) as { rows?: RegisterRow[]; error?: string }
      if (!res.ok || !j.rows) { setError(j.error ?? 'Search failed'); return }
      setRows(j.rows)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px', borderBottom: '1px solid #E0E0E0', flexShrink: 0, flexWrap: 'wrap' }}>
        <div>
          <label style={lbl}>From</label>
          <input type="date" value={from} max={todayYMD()} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, width: 150 }} />
        </div>
        <div>
          <label style={lbl}>To</label>
          <input type="date" value={to} max={todayYMD()} onChange={(e) => setTo(e.target.value)} style={{ ...inp, width: 150 }} />
        </div>
        <button style={{ ...btnPrimary, padding: '6px 14px' }} onClick={handleSearch} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Search style={{ width: 12, height: 12 }} />}
          Search Register
        </button>
        {rows && (
          <a
            href={`/api/police-register?date=${from}`}
            style={{ ...btnSecondary, textDecoration: 'none' }}
            title="Download the official daily register PDF for the From date"
          >
            <FileDown style={{ width: 11, height: 11 }} /> Register PDF ({from})
          </a>
        )}
        {error && <span style={{ fontSize: 12, color: '#DC3545' }}>{error}</span>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!rows ? (
          <EmptyHint text="Choose a date range and search the purchase register." />
        ) : rows.length === 0 ? (
          <EmptyHint text="No completed purchases found in this date range." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                {['Date / Time', 'Ref No.', 'Seller', 'ID Number', 'Goods', 'Amount (R)', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.purchaseId}
                  onClick={() => setDetail(r)}
                  style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: '1px solid #F0F0F0', cursor: 'pointer' }}
                >
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDateTime(r.createdAt)}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{r.refNumber}</td>
                  <td style={TD}>
                    {r.supplierName}
                    {r.blacklisted && <BlacklistBadge />}
                  </td>
                  <td style={TD}>{r.idNumber ?? '—'}</td>
                  <td style={{ ...TD, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.lines.map((l) => `${l.productName} (${l.quantity}${l.unit})`).join(', ')}
                  </td>
                  <td style={{ ...TD, fontWeight: 600, whiteSpace: 'nowrap' }}>{Number(r.totalAmount).toFixed(2)}</td>
                  <td style={{ ...TD, color: NAVY, fontSize: 11 }}>View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Drawer title={`Purchase ${detail.refNumber}`} onClose={() => setDetail(null)}>
          <DL rows={[
            ['Date / time', fmtDateTime(detail.createdAt)],
            ['Seller',      detail.supplierName],
            ['ID number',   detail.idNumber ?? '—'],
            ['Date of birth', fmtDate(detail.dateOfBirth)],
            ['Address',     detail.address],
            ['Total paid',  `R ${Number(detail.totalAmount).toFixed(2)}`],
          ]} />
          {detail.blacklisted && <BlacklistNotice reason={null} />}

          <SectionLabel text="Goods purchased" />
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                <th style={{ ...TH, height: 24 }}>Product</th>
                <th style={{ ...TH, height: 24 }}>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <td style={TD}>{l.productName}</td>
                  <td style={TD}>{l.quantity} {l.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {detail.idPhotoUrl && (
            <>
              <SectionLabel text="Seller ID photo" />
              <PhotoImg src={detail.idPhotoUrl} alt="Seller ID" big />
            </>
          )}
          <PhotoStrip urls={detail.photoUrls} label="Transaction photos" />
        </Drawer>
      )}
    </>
  )
}

// ─── Person Search tab ────────────────────────────────────────────────────────

function PersonTab({ visitId, guardedFetch }: { visitId: string; guardedFetch: GuardedFetch }) {
  const [q, setQ]                   = useState('')
  const [rows, setRows]             = useState<PersonRow[] | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [detail, setDetail]         = useState<PersonDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [reportBusy, setReportBusy] = useState(false)

  async function handlePersonReport(customerId: string, fullName: string) {
    if (reportBusy) return
    setReportBusy(true)
    try {
      const err = await downloadPdf(
        guardedFetch,
        `/api/police-search/person/${customerId}/report?visitId=${visitId}`,
        `person-record-${fullName.replace(/[^\w-]/g, '-')}.pdf`
      )
      if (err) setError(err)
    } finally {
      setReportBusy(false)
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading || q.trim().length < 2) return
    setLoading(true)
    setError(null)
    try {
      const res = await guardedFetch(`/api/police-search/person?visitId=${visitId}&q=${encodeURIComponent(q.trim())}`)
      if (!res) return
      const j = await res.json().catch(() => ({})) as { rows?: PersonRow[]; error?: string }
      if (!res.ok || !j.rows) { setError(j.error ?? 'Search failed'); return }
      setRows(j.rows)
    } finally {
      setLoading(false)
    }
  }

  async function openDetail(customerId: string) {
    if (detailLoading) return
    setDetailLoading(customerId)
    try {
      const res = await guardedFetch(`/api/police-search/person/${customerId}?visitId=${visitId}`)
      if (!res) return
      const j = await res.json().catch(() => ({})) as PersonDetail & { error?: string }
      if (!res.ok || !j.customer) { setError(j.error ?? 'Failed to load person'); return }
      setDetail(j)
    } finally {
      setDetailLoading(null)
    }
  }

  return (
    <>
      <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px', borderBottom: '1px solid #E0E0E0', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220, maxWidth: 420 }}>
          <label style={lbl}>Name, Company or ID Number</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Dlamini or 8501015800083" style={inp} />
        </div>
        <button type="submit" style={{ ...btnPrimary, padding: '6px 14px' }} disabled={loading || q.trim().length < 2}>
          {loading ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Search style={{ width: 12, height: 12 }} />}
          Search Persons
        </button>
        {error && <span style={{ fontSize: 12, color: '#DC3545' }}>{error}</span>}
      </form>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!rows ? (
          <EmptyHint text="Search for a person by name, company or ID number." />
        ) : rows.length === 0 ? (
          <EmptyHint text="No matching persons found in this yard's records." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                {['Photo', 'Name', 'ID Number', 'Phone', 'Address', 'Transactions', 'Last Sale', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.customerId}
                  onClick={() => openDetail(r.customerId)}
                  style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: '1px solid #F0F0F0', cursor: 'pointer' }}
                >
                  <td style={TD}>
                    {r.idPhotoUrl
                      ? <PhotoImg src={r.idPhotoUrl} alt={r.fullName} />
                      : <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: 3, background: '#E9ECEF', alignItems: 'center', justifyContent: 'center' }}><UserIcon style={{ width: 15, height: 15, color: '#ADB5BD' }} /></span>}
                  </td>
                  <td style={{ ...TD, fontWeight: 600 }}>
                    {r.fullName}
                    {r.blacklisted && <BlacklistBadge />}
                  </td>
                  <td style={TD}>{r.idNumber ?? '—'}</td>
                  <td style={TD}>{r.phone}</td>
                  <td style={{ ...TD, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.address ?? '—'}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>{r.purchaseCount}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.lastPurchaseAt)}</td>
                  <td style={{ ...TD, color: NAVY, fontSize: 11, whiteSpace: 'nowrap' }}>
                    {detailLoading === r.customerId ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : 'View →'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Drawer title={detail.customer.fullName} onClose={() => setDetail(null)}>
          {detail.customer.blacklisted && <BlacklistNotice reason={detail.customer.blacklistReason} />}
          <button
            onClick={() => handlePersonReport(detail.customer.customerId, detail.customer.fullName)}
            disabled={reportBusy}
            style={{ ...btnPrimary, padding: '6px 14px', marginBottom: 12, opacity: reportBusy ? 0.6 : 1, cursor: reportBusy ? 'wait' : 'pointer' }}
          >
            {reportBusy
              ? <><Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> Preparing…</>
              : <><FileDown style={{ width: 12, height: 12 }} /> Download Person Record (PDF)</>}
          </button>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
            {detail.customer.idPhotoUrl && <PhotoImg src={detail.customer.idPhotoUrl} alt="ID photo" big />}
            <div style={{ flex: 1 }}>
              <DL rows={[
                ['ID number',     detail.customer.idNumber ?? '—'],
                ['Date of birth', fmtDate(detail.customer.dateOfBirth)],
                ['Gender',        detail.customer.gender ?? '—'],
                ['Nationality',   detail.customer.nationality ?? '—'],
                ['Phone',         detail.customer.phone],
                ['Email',         detail.customer.email ?? '—'],
                ['Address',       detail.customer.physicalAddress ?? detail.customer.postalAddress ?? '—'],
              ]} />
            </div>
          </div>

          <SectionLabel text={`Transaction history (${detail.purchases.length}${detail.purchases.length === 100 ? '+ (latest 100 shown)' : ''})`} />
          {detail.purchases.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6C757D' }}>No completed purchases on record.</p>
          ) : (
            detail.purchases.map((p) => (
              <div key={p.purchaseId} style={{ border: '1px solid #E0E0E0', borderRadius: 3, padding: '8px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{p.refNumber}</span>
                  <span style={{ fontSize: 11, color: '#6C757D' }}>{fmtDateTime(p.createdAt)}</span>
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#212529' }}>
                  {p.lines.map((l) => `${l.productName} (${l.quantity}${l.unit})`).join(', ')}
                </p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#212529' }}>R {Number(p.totalAmount).toFixed(2)}</p>
                <PhotoStrip urls={p.photoUrls} label={null} />
              </div>
            ))
          )}
        </Drawer>
      )}
    </>
  )
}

// ─── Goods Search tab ─────────────────────────────────────────────────────────

function GoodsTab({ visitId, guardedFetch }: { visitId: string; guardedFetch: GuardedFetch }) {
  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products', fetcher)
  const products = productsData?.products ?? []

  const [productId, setProductId] = useState('')
  const [from, setFrom]           = useState('')
  const [to, setTo]               = useState('')
  const [minQty, setMinQty]       = useState('')
  const [rows, setRows]           = useState<GoodsRow[] | null>(null)
  const [productName, setProductName] = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [detail, setDetail]       = useState<GoodsRow | null>(null)
  const [lastQuery, setLastQuery] = useState<{ productId: string; from: string; to: string; minQty: string } | null>(null)
  const [reportBusy, setReportBusy] = useState(false)

  async function handleSearch() {
    if (loading || !productId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ visitId, productId })
      if (from)   params.set('from', from)
      if (to)     params.set('to', to)
      if (minQty) params.set('minQuantity', minQty)
      const res = await guardedFetch(`/api/police-search/goods?${params.toString()}`)
      if (!res) return
      const j = await res.json().catch(() => ({})) as { rows?: GoodsRow[]; productName?: string | null; error?: string }
      if (!res.ok || !j.rows) { setError(j.error ?? 'Search failed'); return }
      setRows(j.rows)
      setProductName(j.productName ?? null)
      setLastQuery({ productId, from, to, minQty })
    } finally {
      setLoading(false)
    }
  }

  async function handleGoodsReport() {
    if (reportBusy || !lastQuery) return
    setReportBusy(true)
    try {
      const params = new URLSearchParams({ visitId, productId: lastQuery.productId })
      if (lastQuery.from)   params.set('from', lastQuery.from)
      if (lastQuery.to)     params.set('to', lastQuery.to)
      if (lastQuery.minQty) params.set('minQuantity', lastQuery.minQty)
      const err = await downloadPdf(
        guardedFetch,
        `/api/police-search/goods/report?${params.toString()}`,
        `goods-trace-${(productName ?? 'product').replace(/[^\w-]/g, '-')}.pdf`
      )
      if (err) setError(err)
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px', borderBottom: '1px solid #E0E0E0', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <label style={lbl}>Product / Material</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} style={{ ...inp, height: 30 }}>
            <option value="">Select a product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>From (optional)</label>
          <input type="date" value={from} max={todayYMD()} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, width: 145 }} />
        </div>
        <div>
          <label style={lbl}>To (optional)</label>
          <input type="date" value={to} max={todayYMD()} onChange={(e) => setTo(e.target.value)} style={{ ...inp, width: 145 }} />
        </div>
        <div>
          <label style={lbl}>Min Quantity</label>
          <input type="number" min="0" step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="Any" style={{ ...inp, width: 100 }} />
        </div>
        <button style={{ ...btnPrimary, padding: '6px 14px' }} onClick={handleSearch} disabled={loading || !productId}>
          {loading ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Search style={{ width: 12, height: 12 }} />}
          Trace Goods
        </button>
        {rows && rows.length > 0 && lastQuery && (
          <button style={{ ...btnSecondary, opacity: reportBusy ? 0.6 : 1, cursor: reportBusy ? 'wait' : 'pointer' }} onClick={handleGoodsReport} disabled={reportBusy}>
            {reportBusy
              ? <Loader2 className="animate-spin" style={{ width: 11, height: 11 }} />
              : <FileDown style={{ width: 11, height: 11 }} />}
            Download Report (PDF)
          </button>
        )}
        {error && <span style={{ fontSize: 12, color: '#DC3545' }}>{error}</span>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!rows ? (
          <EmptyHint text="Pick a product (e.g. copper cable) to trace who sold it and when." />
        ) : rows.length === 0 ? (
          <EmptyHint text={`No purchases of ${productName ?? 'this product'} found for the chosen filters.`} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                {['Date / Time', 'Ref No.', 'Seller', 'ID Number', 'Quantity', 'Line Total (R)', 'Photos', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.purchaseId}-${i}`}
                  onClick={() => setDetail(r)}
                  style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: '1px solid #F0F0F0', cursor: 'pointer' }}
                >
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDateTime(r.createdAt)}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{r.refNumber}</td>
                  <td style={TD}>
                    {r.supplierName}
                    {r.blacklisted && <BlacklistBadge />}
                  </td>
                  <td style={TD}>{r.idNumber ?? '—'}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.quantity} {r.unit}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{Number(r.lineTotal).toFixed(2)}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>{r.photoUrls.length || '—'}</td>
                  <td style={{ ...TD, color: NAVY, fontSize: 11 }}>View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Drawer title={`${productName ?? 'Goods'} — ${detail.refNumber}`} onClose={() => setDetail(null)}>
          <DL rows={[
            ['Date / time', fmtDateTime(detail.createdAt)],
            ['Seller',      detail.supplierName],
            ['ID number',   detail.idNumber ?? '—'],
            ['Quantity',    `${detail.quantity} ${detail.unit}`],
            ['Line total',  `R ${Number(detail.lineTotal).toFixed(2)}`],
          ]} />
          {detail.blacklisted && <BlacklistNotice reason={null} />}
          <PhotoStrip urls={detail.photoUrls} label="Transaction photos" />
        </Drawer>
      )}
    </>
  )
}

// ─── Signature dialog ─────────────────────────────────────────────────────────

function SignatureDialog({
  visitId,
  onClose,
  onSigned,
  onSessionInvalid,
}: {
  visitId: string
  onClose: () => void
  onSigned: () => void
  onSessionInvalid: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing]    = useState(false)
  const [hasStrokes, setStrokes] = useState(false)
  const [saving, setSaving]      = useState(false)
  const [error, setError]        = useState<string | null>(null)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
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
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !lastPos.current) return
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
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setStrokes(false)
  }

  async function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes || saving) return
    setSaving(true)
    setError(null)
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Failed to capture signature')

      const fd = new FormData()
      fd.append('context', 'police_signature')
      fd.append('referenceId', visitId)
      fd.append('file', blob, 'signature.png')

      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error('Signature upload failed')
      const { key } = await uploadRes.json() as { key: string }

      const patchRes = await fetch(`/api/police-visits/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign', signatureR2Key: key }),
      })
      if (patchRes.status === 409) { onSessionInvalid(); return }
      if (!patchRes.ok) throw new Error('Failed to complete inspection')

      onSigned()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signature')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 4, width: '100%', maxWidth: 560, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: NAVY }}>
            <Pen style={{ width: 15, height: 15 }} /> End Inspection — Officer Sign-off
          </span>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X style={{ width: 16, height: 16, color: '#6C757D' }} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#6C757D', margin: '0 0 10px' }}>
          By signing you confirm that you inspected this dealer&apos;s register. Your searches are recorded on the inspection certificate.
        </p>

        <div style={{ border: '1px solid #ABABAB', borderRadius: 3, overflow: 'hidden', background: '#fff' }}>
          <canvas
            ref={canvasRef}
            width={520}
            height={200}
            style={{ width: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        </div>

        {error && <p style={{ fontSize: 12, color: '#DC3545', margin: '8px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <button style={btnSecondary} onClick={clearCanvas} disabled={saving}>
            <RotateCcw style={{ width: 11, height: 11 }} /> Clear
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
            <button
              style={{ ...btnPrimary, padding: '6px 14px', opacity: saving || !hasStrokes ? 0.6 : 1, cursor: saving || !hasStrokes ? 'not-allowed' : 'pointer' }}
              onClick={handleSave}
              disabled={saving || !hasStrokes}
            >
              {saving
                ? <><Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> Saving…</>
                : <><CheckCircle style={{ width: 12, height: 12 }} /> Sign &amp; Complete</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function DoneScreen({ visit, onFinish }: { visit: Visit; onFinish: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <CheckCircle style={{ width: 44, height: 44, color: '#1C8743' }} />
      <p style={{ fontSize: 16, fontWeight: 700, color: '#212529', margin: 0 }}>Inspection completed</p>
      <p style={{ fontSize: 12.5, color: '#6C757D', margin: 0, maxWidth: 440, textAlign: 'center' }}>
        Thank you, {visit.rank ? `${visit.rank} ` : ''}{visit.officerName}. Your visit and all searches
        performed have been recorded. Download your inspection certificate below.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <a href={`/api/police-visits/${visit.id}/certificate`} style={{ ...btnPrimary, textDecoration: 'none' }}>
          <FileDown style={{ width: 13, height: 13 }} /> Download Inspection Certificate
        </a>
        <button style={{ ...btnSecondary, padding: '7px 16px' }} onClick={onFinish}>Finish</button>
      </div>
    </div>
  )
}

// ─── Small shared pieces ──────────────────────────────────────────────────────

function EmptyHint({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#6C757D', fontSize: 12.5 }}>
      {text}
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return <p style={{ ...lbl, marginTop: 12, marginBottom: 6 }}>{text}</p>
}

function BlacklistBadge() {
  return (
    <span style={{ display: 'inline-flex', marginLeft: 6, padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: '#FDECEA', color: '#DC3545', verticalAlign: 'middle' }}>
      BLACKLISTED
    </span>
  )
}

function BlacklistNotice({ reason }: { reason: string | null }) {
  return (
    <div style={{ background: '#FDECEA', border: '1px solid #DC3545', borderRadius: 3, padding: '8px 12px', margin: '0 0 12px' }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#DC3545' }}>
        <AlertTriangle style={{ width: 12, height: 12, display: 'inline', verticalAlign: '-2px' }} /> This person is blacklisted at this yard
      </p>
      {reason && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#8A2530' }}>Reason: {reason}</p>}
    </div>
  )
}

function DL({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ marginBottom: 6 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', padding: '3px 0', borderBottom: '1px solid #F5F5F5' }}>
          <span style={{ width: 130, fontSize: 11, fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: 12.5, color: '#212529' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function PhotoImg({ src, alt, big }: { src: string; alt: string; big?: boolean }) {
  const [failed, setFailed] = useState(false)
  const size = big ? { width: 120, height: 120 } : { width: 34, height: 34 }
  if (failed) {
    return (
      <span style={{ display: 'inline-flex', ...size, borderRadius: 3, background: '#E9ECEF', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#ADB5BD' }}>
        no photo
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ ...size, objectFit: 'cover', borderRadius: 3, border: '1px solid #D0D0D0', display: 'inline-block' }}
    />
  )
}

function PhotoStrip({ urls, label }: { urls: string[]; label: string | null }) {
  const [openUrl, setOpenUrl] = useState<string | null>(null)
  if (urls.length === 0) return null
  return (
    <>
      {label && <SectionLabel text={label} />}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: label ? 0 : 6 }}>
        {urls.map((u, i) => (
          <button key={i} onClick={(e) => { e.stopPropagation(); setOpenUrl(u) }} style={{ border: 'none', background: 'none', padding: 0, cursor: 'zoom-in' }}>
            <PhotoImg src={u} alt={`Photo ${i + 1}`} big />
          </button>
        ))}
      </div>
      {openUrl && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
          onClick={() => setOpenUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={openUrl} alt="Enlarged photo" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 4 }} />
        </div>
      )}
    </>
  )
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 520, background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X style={{ width: 16, height: 16, color: '#6C757D' }} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
