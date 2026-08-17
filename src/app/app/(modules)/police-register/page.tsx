'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import useSWR, { mutate } from 'swr'
import { Dialog } from '@/components/ui/dialog'
import { FileDown, Pen, CheckCircle, ExternalLink, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, OctagonX, ShieldCheck, Loader2, ClipboardList, History } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'
import { DEFAULT_POLICE_SERVICE_NAME, DEFAULT_POLICE_LEGAL_NOTE } from '@/lib/police-defaults'
import { StatusBadge as SharedStatusBadge } from '@/components/ui/DataTable'
import { fetcher } from '@/lib/swrFetcher'
import {
  inp, lbl, TH, TD, HEADER_GRAD, NAVY,
  Btn, Field, EmptyHint, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'
import { useSignatureCanvas } from '@/hooks/useSignatureCanvas'


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

type Tab = 'generate' | 'history'

export default function PoliceRegisterPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const [tab, setTab]             = useState<Tab>('generate')
  const [date, setDate]           = useState(today)
  const [officerName, setOfficer] = useState('')
  const [badgeNumber, setBadge]   = useState('')
  const [stationName, setStation] = useState('')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const [pendingVisitId, setPendingVisitId] = useState<string | null>(null)
  const [sigDialogOpen, setSigDialogOpen]   = useState(false)
  const [visitsPage, setVisitsPage]         = useState(1)
  const VISITS_PAGE_SIZE = 20

  const { data: visitsData, isLoading: visitsLoading } =
    useSWR<{ visits: PoliceVisit[]; total: number }>(
      tab === 'history' ? `/api/police-visits?limit=${VISITS_PAGE_SIZE}&offset=${(visitsPage - 1) * VISITS_PAGE_SIZE}` : null,
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
    <>
      <PortalPage
        tabs={[
          { value: 'generate', label: 'Generate Register', icon: ClipboardList },
          { value: 'history',  label: 'Visit History',      icon: History },
        ]}
        active={tab}
        onChange={(v) => setTab(v as Tab)}
        actions={
          <Btn variant="primary" size="sm" icon={ShieldCheck} href="/police">
            Officer Portal
          </Btn>
        }
        // Capped and centered (see src/lib/pageWidthCaps.ts, which
        // PageTitleBar reads to cap/border itself to match).
        maxWidth={960}
      >
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: tab === 'generate' ? 16 : 0 }}>

          {tab === 'generate' && (
            <div>
              {/* Officer Details card */}
              <div style={{ background: '#fff', border: '1px solid #D0D0D0', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>Officer Details</span>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label="Register Date">
                    <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 170 }} />
                  </Field>
                  <Field label="Officer Name" required>
                    <input value={officerName} onChange={(e) => setOfficer(e.target.value)} placeholder="Constable J. Nkosi" style={inp} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Badge / Force Number">
                      <input value={badgeNumber} onChange={(e) => setBadge(e.target.value)} placeholder="12345" style={inp} />
                    </Field>
                    <Field label="Police Station">
                      <input value={stationName} onChange={(e) => setStation(e.target.value)} placeholder="Mbabane Central" style={inp} />
                    </Field>
                  </div>
                  <div>
                    <label style={lbl}>Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Routine inspection, routine audit, etc."
                      rows={2}
                      style={{ ...inp, height: 'auto', padding: '6px 8px', resize: 'vertical' }}
                    />
                  </div>
                  {error && (
                    <p style={{ fontSize: 12, padding: '6px 10px', borderRadius: 2, color: colors.danger, background: colors.dangerBg, margin: 0 }}>{error}</p>
                  )}
                  <Btn
                    variant="primary"
                    icon={FileDown}
                    loading={loading}
                    disabled={!date || !officerName.trim()}
                    onClick={handleDownload}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {loading ? 'Generating PDF…' : 'Generate & Download PDF'}
                  </Btn>
                </div>
              </div>

              {/* Legal note (configurable in Settings → Police Register) */}
              <div style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2, padding: '8px 12px', fontSize: 11 }}>
                <p style={{ fontWeight: 700, color: colors.process, margin: '0 0 3px' }}>Legal requirement — {serviceName}</p>
                <p style={{ color: colors.processHover, margin: 0 }}>{legalNote}</p>
              </div>

              {/* Officer portal pointer */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #D0D0D0', borderRadius: 2, padding: '8px 12px' }}>
                <ShieldCheck style={{ width: 14, height: 14, color: NAVY, flexShrink: 0 }} />
                <p style={{ fontSize: 11, color: '#6C757D', margin: 0 }}>
                  Visiting officers can search the register themselves at the{' '}
                  <a href="/police" style={{ color: colors.process, fontWeight: 600 }}>Officer Portal</a>
                  {' '}— each session is logged and signed.
                </p>
              </div>
            </div>
          )}

          {tab === 'history' && (
            visitsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12, gap: 8 }}>
                <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Loading…
              </div>
            ) : !visitsData?.visits?.length ? (
              <EmptyHint text="No visits recorded yet" />
            ) : (
              <>
                <VisitHistoryTable visits={visitsData.visits} />
                <VisitHistoryPager
                  page={visitsPage}
                  pageSize={VISITS_PAGE_SIZE}
                  total={visitsData.total}
                  onPageChange={setVisitsPage}
                />
              </>
            )
          )}
        </div>
      </PortalPage>

      {sigDialogOpen && pendingVisitId && (
        <SignatureDialog
          visitId={pendingVisitId}
          onClose={() => { setSigDialogOpen(false); setPendingVisitId(null) }}
          onSaved={() => { setSigDialogOpen(false); setPendingVisitId(null); mutate('/api/police-visits?limit=50'); toast.success('Signature saved') }}
        />
      )}
    </>
  )
}

// ─── Visit History table ──────────────────────────────────────────────────────

// A police visit's "active" means an inspection session currently under way
// — semantically "in progress", not the enabled/live meaning statusStyle()'s
// own 'active' key carries elsewhere (which renders green) — so it's
// remapped to the shared 'in_progress' status (blue), not forced onto a
// same-named key with a different meaning.
function StatusBadge({ status }: { status: PoliceVisit['status'] }) {
  return <SharedStatusBadge status={status === 'active' ? 'in_progress' : status} />
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
        <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
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
                    <Btn
                      variant="danger"
                      size="sm"
                      icon={OctagonX}
                      loading={forceEnding === v.id}
                      onClick={(e) => { e.stopPropagation(); handleForceEnd(v.id) }}
                    >
                      Force End
                    </Btn>
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

/** Matches DataTable's own pager styling (prev/next only — the visit list
 * doesn't need numbered pages) since this table is hand-rolled rather than
 * built on DataTable. */
function VisitHistoryPager({
  page, pageSize, total, onPageChange,
}: {
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const showing = `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 2px 0', flexShrink: 0 }}>
      <span style={{ fontSize: 11, color: '#6C757D' }}>{showing}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          className="px-2 h-6 rounded-sm border border-[#B0B0B0] hover:bg-[#E8E8E8] disabled:opacity-40 disabled:cursor-not-allowed text-[11px] transition-colors"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <span style={{ fontSize: 11, color: '#212529', padding: '0 6px' }}>{page} / {totalPages}</span>
        <button
          className="px-2 h-6 rounded-sm border border-[#B0B0B0] hover:bg-[#E8E8E8] disabled:opacity-40 disabled:cursor-not-allowed text-[11px] transition-colors"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
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
  const { canvasRef, hasStrokes, canvasProps, clearCanvas, toBlob } = useSignatureCanvas()
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!hasStrokes) return
    setSaving(true)

    try {
      const blob = await toBlob()
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
      <RpxDialogContent maxWidth={540}>
        <RpxDialogHeader title="Capture Officer Signature" icon={Pen} onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 10px' }}>
            Ask the officer to sign below using a mouse or touchscreen.
          </p>
          <div style={{ border: '1px solid #ABABAB', borderRadius: 2, overflow: 'hidden', background: '#fff' }}>
            <canvas
              ref={canvasRef}
              width={480}
              height={200}
              style={{ width: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
              {...canvasProps}
            />
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn icon={RotateCcw} disabled={saving} onClick={clearCanvas} style={{ marginRight: 'auto' }}>
            Clear
          </Btn>
          <Btn disabled={saving} onClick={onClose}>Skip</Btn>
          <Btn variant="primary" icon={CheckCircle} loading={saving} disabled={!hasStrokes} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Signature'}
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
