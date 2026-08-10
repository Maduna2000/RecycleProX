'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Calculator, Clock, Lock, RefreshCw, FolderOpen, ChevronLeft, ChevronRight, Upload, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { DENOMINATIONS, DENOMINATION_LABELS, type Denomination, CURRENCY_SYMBOLS, CURRENCY_LABELS, type Currency } from '@/lib/schemas/cashup'
import { colors } from '@/lib/design-tokens'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'
import { useOfflineStore } from '@/stores/offlineStore'
import { offlineDB } from '@/lib/offline/db'
import { ReportButton } from './_components/ReportButton'
import { PreviousReportsModal } from './_components/PreviousReportsModal'
import { CARD_BORDER } from '@/components/rpx/styles'
import { Btn, PortalPage, PANEL, PANEL_HEAD, HEADER_GRAD, inp, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { fetcher } from '@/lib/swrFetcher'


type CashUp = {
  id: string
  sessionDate: string
  currency: Currency
  status: 'open' | 'submitted' | 'approved' | 'voided'
  openedByUserId: string
  openedAt: string
  closedByUserId?: string
  closedAt?: string
  approvedByUserId?: string
  approvedAt?: string
  rejectedByUserId?: string
  rejectedAt?: string
  rejectionReason?: string
  openingBalance:      string
  systemCashSales:     string
  systemCashPurchases: string
  systemCashPayments:  string
  systemCashExpected:  string
  expensesTotal:       string
  cardPaymentsTotal:   string
  drawingsReceived:    string
  loansTotal:          string
  declaredCash?:       string
  variance?:           string
  notes?:              string
  denominations?: Record<string, number>
}

type LiveStats = {
  cashSales:     string
  cardSales:     string
  cardOnlySales: string
  cashPurchases: string
  transferredPurchases: string
  cashPayments:  string
  expenses:      string
  loanAdvance:   string
  loanRepayment: string
  nonCashAdvanced: string
  floatTopUps:   string
  unpaidToday:   { total: string; count: number }
  unpaidAllTime: { total: string; count: number }
  finPeriodCumulative: string
}

type ExpenseItem = {
  id: string; refNumber: string; description: string
  amount: string; paymentMethod: string; status: string
  expenseType: { name: string }
}

type MomoStatementSummary = {
  id: string; totalSent: string; totalReceived: string; totalFees: string
  transactionCount: number; closingBalance: string | null
}


// ─── Ledger row — a dense table row in the reconciliation grid ───────────────
// positive = green. negative = neutral text with "−" prefix (NOT red — deductions are expected).
// Red is reserved only for the VarianceRow when cash is short.
function ReconRow({ label, value, positive, negative, highlight, muted, subtotal, currencySymbol = 'R', action, divider }: {
  label: string; value: string | undefined
  positive?: boolean; negative?: boolean; highlight?: boolean; muted?: boolean; subtotal?: boolean
  currencySymbol?: string
  /** Optional report-download button rendered in its own narrow trailing cell. */
  action?: React.ReactNode
  /** Draws a heavier rule above this row to mark a new section. */
  divider?: boolean
}) {
  const n = new Decimal(value ?? '0')
  const valueColor = positive && !n.isZero() ? colors.action
                   : muted                    ? colors.textSecondary
                   : colors.textPrimary
  return (
    <tr style={{ background: subtotal ? colors.toolbar : undefined, borderTop: divider ? '2px solid #B0B0B0' : '1px solid #E8E8E8' }}>
      <td style={{ height: 24, padding: '2px 8px', fontSize: 12, fontWeight: highlight || subtotal ? 600 : 400, color: colors.textSecondary }}>
        {label}
      </td>
      <td className="font-mono text-right" style={{ padding: '2px 8px', fontSize: 12, fontWeight: highlight || subtotal ? 600 : 400, color: valueColor, whiteSpace: 'nowrap' }}>
        {negative && !n.isZero() ? '−' : ''}{currencySymbol} {n.abs().toFixed(2)}
      </td>
      <td style={{ width: 1, padding: action ? '2px 6px 2px 0' : 0 }}>{action}</td>
    </tr>
  )
}

// ─── Variance row — only shown after denominations entered ────────────────────
function VarianceRow({ variance, currencySymbol = 'R' }: { variance: string; currencySymbol?: string }) {
  const v = new Decimal(variance)
  const style = v.isZero()
    ? { background: colors.actionBg,  color: colors.action  }
    : v.gt(0)
    ? { background: colors.processBg, color: colors.process }
    : { background: colors.dangerBg,  color: colors.danger  }
  return (
    <tr style={{ borderTop: '2px solid #B0B0B0' }}>
      <td colSpan={2} style={{ padding: 0 }}>
        <div className="flex justify-between font-semibold px-2 py-1.5 text-sm" style={style}>
          <span>Balance (Variance)</span>
          <span className="font-mono">{v.gt(0) ? '+' : ''}{currencySymbol} {v.toFixed(2)}</span>
        </div>
      </td>
      <td style={{ width: 1 }} />
    </tr>
  )
}

// ─── Count Cash modal ─────────────────────────────────────────────────────────
function CountCashModal({ counts, setCounts, notes, setNotes, submitting, handleSubmit, onClose, expectedCash, currencySymbol = 'R' }: {
  counts: Record<number, number>
  setCounts: React.Dispatch<React.SetStateAction<Record<number, number>>>
  notes: string
  setNotes: (v: string) => void
  submitting: boolean
  handleSubmit: () => Promise<void>
  onClose: () => void
  expectedCash: Decimal
  currencySymbol?: string
}) {
  const total = DENOMINATIONS.reduce(
    (s, d) => s.plus(new Decimal(counts[d] ?? 0).times(d).div(100)),
    new Decimal(0)
  )
  const variance = total.minus(expectedCash)
  const hasCounted = !total.isZero()

  // Draggable state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragOffset = React.useRef({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    if (position) {
      dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    } else {
      // Initial position: center of screen
      const dialogEl = e.currentTarget.closest('[role="dialog"]') as HTMLElement | null
      if (dialogEl) {
        const dialogRect = dialogEl.getBoundingClientRect()
        dragOffset.current = { x: e.clientX - dialogRect.left, y: e.clientY - dialogRect.top }
        setPosition({ x: dialogRect.left, y: dialogRect.top })
      }
    }
    e.preventDefault()
  }

  React.useEffect(() => {
    if (!dragging) return
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      })
    }
    const handleMouseUp = () => setDragging(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging])

  // Split denominations into two columns (left: first half, right: second half)
  const midpoint = Math.ceil(DENOMINATIONS.length / 2)
  const leftDenoms = DENOMINATIONS.slice(0, midpoint)
  const rightDenoms = DENOMINATIONS.slice(midpoint)

  // Render a single denomination row
  const renderDenomRow = (d: Denomination, idx: number) => {
    const val = new Decimal(counts[d] ?? 0).times(d).div(100)
    return (
      <div
        key={d}
        className="flex items-center gap-2"
        style={{ padding: '4px 8px', background: idx % 2 === 0 ? '#fff' : '#FAFAFA', borderTop: idx > 0 ? `1px solid ${colors.border}` : undefined }}
      >
        <span className="font-mono font-semibold text-xs flex-shrink-0" style={{ color: colors.textPrimary, width: 50 }}>
          {DENOMINATION_LABELS[d]}
        </span>
        <Input
          type="number" min={0} step={1} inputMode="numeric"
          value={(counts[d] ?? 0) === 0 ? '' : counts[d]}
          // This counts physical notes/coins, never a money amount — a
          // decimal point makes no sense here. Blocked at keydown (not just
          // cleaned up in onChange) because a type="number" input that types
          // "10." then re-renders with the same parsed value (10) never gets
          // its stale DOM text corrected — React skips the DOM write since
          // the value prop didn't change, leaving "10." stuck on screen.
          onKeyDown={(e) => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
          onChange={(e) => setCounts((prev) => ({ ...prev, [d]: Math.max(0, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)) }))}
          className="w-12 text-center font-mono h-6 text-xs border-[#E0E0E0] px-1"
          disabled={submitting} placeholder="0"
        />
        <span className="font-mono text-xs text-right flex-1" style={{ color: val.isZero() ? colors.textSecondary : colors.textPrimary }}>
          {currencySymbol} {val.toFixed(2)}
        </span>
      </div>
    )
  }

  const dialogStyle: React.CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, transform: 'none', margin: 0 }
    : {}

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={576} style={dialogStyle}>
        <div onMouseDown={handleMouseDown} style={{ cursor: dragging ? 'grabbing' : 'grab' }}>
          <RpxDialogHeader title="Count Cash" onClose={onClose} />
        </div>
        <RpxDialogBody>
        <div className="space-y-3">

          {/* Two-column layout: Denominations left/right, Summary below */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Left column - Notes/Coins (first half) */}
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 3, overflow: 'hidden' }}>
              <div
                className="px-2 py-1 text-xs font-semibold uppercase tracking-wide"
                style={{ background: HEADER_GRAD, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}
              >
                Notes
              </div>
              {leftDenoms.map((d, i) => renderDenomRow(d, i))}
            </div>

            {/* Right column - Coins (second half) */}
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 3, overflow: 'hidden' }}>
              <div
                className="px-2 py-1 text-xs font-semibold uppercase tracking-wide"
                style={{ background: HEADER_GRAD, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}
              >
                Coins
              </div>
              {rightDenoms.map((d, i) => renderDenomRow(d, i))}
            </div>
          </div>

          {/* Summary section - full width */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Expected in Drawer */}
            <div style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 3, padding: '8px 10px' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: colors.process, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                Expected in Drawer
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: colors.process }}>
                {currencySymbol} {expectedCash.toFixed(2)}
              </span>
            </div>

            {/* Cash Counted */}
            <div style={{ background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '8px 10px' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                Cash Counted
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: total.isZero() ? colors.textSecondary : colors.textPrimary }}>
                {currencySymbol} {total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Variance row - full width */}
          {hasCounted ? (
            <div
              className="flex justify-between items-center px-3 py-2"
              style={{
                background: variance.isZero() ? colors.actionBg : variance.gt(0) ? colors.processBg : colors.dangerBg,
                border: `1px solid ${variance.isZero() ? colors.action : variance.gt(0) ? colors.process : colors.danger}`,
                borderRadius: 3,
              }}
            >
              <span className="text-xs font-semibold uppercase" style={{ color: variance.isZero() ? colors.action : variance.gt(0) ? colors.process : colors.danger }}>
                {variance.isZero() ? 'Balanced' : variance.gt(0) ? 'Over' : 'Short'}
              </span>
              <span className="font-mono font-bold text-base" style={{ color: variance.isZero() ? colors.action : variance.gt(0) ? colors.process : colors.danger }}>
                {variance.gt(0) ? '+' : ''}{currencySymbol} {variance.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="flex justify-between items-center px-3 py-2" style={{ background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 3 }}>
              <span className="text-xs font-semibold uppercase" style={{ color: colors.textSecondary }}>Variance</span>
              <span className="text-xs italic" style={{ color: colors.textSecondary }}>Enter counts above</span>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label style={{ display: 'block', marginBottom: 4, fontSize: 10, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Notes <span style={{ fontWeight: 400, color: colors.textMuted, textTransform: 'none' }}>(optional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="Any comments about the count…"
              style={{ fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 2, resize: 'vertical' }}
              rows={2} disabled={submitting}
            />
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={() => { void handleSubmit(); onClose() }}
            disabled={submitting || !hasCounted}
            loading={submitting}
          >
            Submit Cash-Up
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Reason Modal — replaces window.prompt for void/reject flows ─────────────
function ReasonModal({ title, message, confirmLabel, loading, onConfirm, onClose }: {
  title:        string
  message:      string
  confirmLabel: string
  loading:      boolean
  onConfirm:    (reason: string) => void
  onClose:      () => void
}) {
  const [reason, setReason] = useState('')

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title={title} onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 10px' }}>{message}</p>
          <Label style={{ display: 'block', marginBottom: 4, fontSize: 10, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Reason <span style={{ color: colors.danger }}>(required)</span>
          </Label>
          <Textarea
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
            placeholder="e.g., Unable to reconcile - data lost"
            style={{ fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 2, resize: 'vertical' }}
            rows={2}
            disabled={loading}
            autoFocus
          />
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn
            variant="danger"
            loading={loading}
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason)}
          >
            {confirmLabel}
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Manage Open Sessions Modal ───────────────────────────────────────────────
function ManageSessionsModal({ sessions, onClose, onVoided, currencySymbol = 'R' }: {
  sessions: CashUp[]
  onClose: () => void
  onVoided: () => Promise<void>
  currencySymbol?: string
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const allSelected = selected.size === sessions.length && sessions.length > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sessions.map(s => s.id)))
    }
  }

  function toggleSession(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function handleBulkVoid() {
    if (selected.size === 0) {
      toast.error('Please select at least one session to void')
      return
    }
    if (!voidReason.trim()) {
      toast.error('Please enter a reason for voiding')
      return
    }

    setVoiding(true)
    let successCount = 0
    let failCount = 0

    for (const id of Array.from(selected)) {
      try {
        const res = await fetch(`/api/cashup/${id}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: voidReason }),
        })
        if (res.ok) successCount++
        else failCount++
      } catch {
        failCount++
      }
    }

    setVoiding(false)

    if (successCount > 0) {
      await onVoided()
      toast.success(`Voided ${successCount} session${successCount > 1 ? 's' : ''}`)
      onClose()
    }
    if (failCount > 0) {
      toast.error(`Failed to void ${failCount} session${failCount > 1 ? 's' : ''}`)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={520}>
        <RpxDialogHeader title={`Manage Open Sessions (${sessions.length})`} onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-3">
          {/* Select All checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ width: 14, height: 14, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
              Select All ({sessions.length} sessions)
            </span>
          </label>

          {/* Session list */}
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 3, maxHeight: 300, overflowY: 'auto' }}>
            {sessions.map((s, i) => {
              const date = s.sessionDate.split('T')[0]
              const openingBal = new Decimal(s.openingBalance ?? '0')
              return (
                <label
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer',
                    background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                    borderTop: i > 0 ? `1px solid ${colors.border}` : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSession(s.id)}
                    style={{ width: 14, height: 14, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{date}</p>
                    <p style={{ fontSize: 10, color: colors.textSecondary, margin: 0 }}>
                      Opening: {currencySymbol} {openingBal.toFixed(2)} · Opened {new Date(s.openedAt).toLocaleDateString('en-ZA')}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>

          {/* Void reason */}
          <div>
            <Label style={{ display: 'block', marginBottom: 4, fontSize: 10, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Reason for voiding <span style={{ color: colors.danger }}>(required)</span>
            </Label>
            <Textarea
              value={voidReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setVoidReason(e.target.value)}
              placeholder="e.g., Unable to reconcile - data lost, Old test sessions..."
              style={{ fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 2, resize: 'vertical' }}
              rows={2} disabled={voiding}
            />
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            {selected.size} session{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={onClose} disabled={voiding}>Cancel</Btn>
            <Btn
              variant="danger"
              onClick={handleBulkVoid}
              disabled={voiding || selected.size === 0 || !voidReason.trim()}
              loading={voiding}
            >
              Void {selected.size} Session{selected.size !== 1 ? 's' : ''}
            </Btn>
          </div>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Stat tile — compact KPI-style panel, sits 2-up in a grid ─────────────────
function StatTile({ label, value, sub, valueColor, action }: {
  label: string; value: string; sub?: string; valueColor?: string; action?: React.ReactNode
}) {
  return (
    <div style={PANEL}>
      <div className="flex items-center justify-between" style={{ ...PANEL_HEAD, padding: '4px 8px' }}>
        <span className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: colors.textSecondary }}>{label}</span>
        {action}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <p className="font-mono font-bold text-sm truncate" style={{ color: valueColor ?? colors.textPrimary }}>{value}</p>
        {sub && <p className="text-[10px] mt-0.5 truncate" style={{ color: colors.textSecondary }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── MoMo Statement modal ───────────────────────────────────────────────────────
// Upload the day's MoMo CSV and see the parsed totals, without leaving Cash-Up.
// The full history (past days, delete) still lives at /app/momo-statement —
// this is just the "today, quickly" path.

type MomoLine = {
  id: string; transactionDate: string; status: string; type: string
  fromName: string | null; toName: string | null; toMessage: string | null
  amount: string; fee: string; balance: string | null
}
type MomoDetail = MomoStatementSummary & { fileName: string; openingBalance: string | null; failedCount: number; lines: MomoLine[] }

function MomoStatementModal({
  sessionDate, currSym, onClose, onUploaded,
}: {
  sessionDate: string
  currSym: string
  onClose: () => void
  onUploaded: () => void
}) {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const [uploading, setUploading] = useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const BY_DATE_KEY = `/api/momo-statements/by-date?date=${sessionDate}`
  const { data: byDate, mutate: refreshByDate } = useSWR<{ statement: MomoStatementSummary | null }>(BY_DATE_KEY, fetcher)
  const statementId = byDate?.statement?.id ?? null

  const { data: detail, isLoading: detailLoading, mutate: refreshDetail } = useSWR<MomoDetail>(
    statementId ? `/api/momo-statements/${statementId}` : null,
    fetcher,
  )

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/momo-statements', { method: 'POST', body: fd })
    setUploading(false)

    if (res.ok) {
      const j = await res.json()
      const skippedNote = j.skippedRows > 0 ? ` (${j.skippedRows} row${j.skippedRows === 1 ? '' : 's'} skipped — couldn't parse)` : ''
      toast.success(`Statement imported${skippedNote}`)
      refreshByDate()
      refreshDetail()
      onUploaded()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to import statement')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={760} style={{ maxHeight: '85vh' }}>
        <RpxDialogHeader title="MoMo Statement" onClose={onClose} />
        <RpxDialogBody>
          <div className="flex flex-col gap-3">
            {/* Upload control */}
            {isManager && (
              <div className="flex items-center justify-between" style={{ padding: '8px 10px', border: `1px dashed ${colors.border}`, borderRadius: 2, background: colors.bg }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
                    {detail ? `Uploaded: ${detail.fileName}` : `No statement uploaded for ${sessionDate} yet`}
                  </p>
                  <p style={{ fontSize: 11, color: colors.textSecondary }}>
                    {detail ? 'Uploading again replaces this statement.' : 'Upload the CSV the cashier prints/exports for this day.'}
                  </p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFilePicked} disabled={uploading} />
                <Btn size="sm" icon={uploading ? Loader2 : Upload} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Importing…' : detail ? 'Replace' : 'Upload'}
                </Btn>
              </div>
            )}

            {/* Results */}
            {detailLoading && statementId && (
              <div className="flex items-center gap-2" style={{ color: colors.textSecondary, fontSize: 12 }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            )}

            {detail && (
              <>
                <div className="grid grid-cols-5 gap-2">
                  <MomoSummaryTile label="Sent" value={`${currSym} ${new Decimal(detail.totalSent).toFixed(2)}`} color={colors.process} />
                  <MomoSummaryTile label="Received" value={`${currSym} ${new Decimal(detail.totalReceived).toFixed(2)}`} color={colors.action} />
                  <MomoSummaryTile label="Fees" value={`${currSym} ${new Decimal(detail.totalFees).toFixed(2)}`} color={colors.textSecondary} />
                  <MomoSummaryTile
                    label="Opening → Closing"
                    value={
                      detail.openingBalance != null && detail.closingBalance != null
                        ? `${currSym}${new Decimal(detail.openingBalance).toFixed(2)} → ${currSym}${new Decimal(detail.closingBalance).toFixed(2)}`
                        : '—'
                    }
                    color={colors.textPrimary}
                  />
                  <MomoSummaryTile
                    label="Transactions"
                    value={`${detail.transactionCount}${detail.failedCount > 0 ? ` (${detail.failedCount} failed)` : ''}`}
                    color={colors.textPrimary}
                  />
                </div>

                <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                  <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: colors.surface }}>
                      <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                        {['Time', 'Type', 'From', 'To', 'Amount', 'Fee'].map((h) => (
                          <th key={h} className="text-left" style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textSecondary }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => {
                        const amt = new Decimal(line.amount)
                        return (
                          <tr key={line.id} style={{ borderTop: `1px solid ${colors.bg}`, opacity: line.status === 'Successful' ? 1 : 0.5 }}>
                            <td style={{ padding: '4px 8px', color: colors.textSecondary, fontSize: 11 }}>
                              {new Date(line.transactionDate).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td style={{ padding: '4px 8px', color: colors.textPrimary }}>{line.type}</td>
                            <td style={{ padding: '4px 8px', color: colors.textPrimary }}>{line.fromName ?? '—'}</td>
                            <td style={{ padding: '4px 8px', color: colors.textPrimary }}>
                              {line.toName ?? '—'}{line.toMessage && <span style={{ color: colors.textSecondary }}> · {line.toMessage}</span>}
                            </td>
                            <td className="font-mono" style={{ padding: '4px 8px', fontWeight: 600, color: amt.isNegative() ? colors.process : colors.action }}>
                              {amt.isNegative() ? '−' : '+'}{currSym} {amt.abs().toFixed(2)}
                            </td>
                            <td className="font-mono" style={{ padding: '4px 8px', color: colors.textSecondary }}>
                              {new Decimal(line.fee).gt(0) ? `${currSym} ${new Decimal(line.fee).toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <button
            onClick={() => { onClose(); router.push('/app/momo-statement') }}
            className="text-xs font-medium underline"
            style={{ color: colors.action, marginRight: 'auto' }}
          >
            View full history
          </button>
          <Btn onClick={onClose}>Close</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

function MomoSummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 2, padding: '6px 8px', background: colors.surface }}>
      <p className="uppercase tracking-wide" style={{ fontSize: 9, fontWeight: 600, color: colors.textSecondary }}>{label}</p>
      <p className="font-mono font-bold" style={{ fontSize: 12, color }}>{value}</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CashUpPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const { mutate: offlineMutate } = useOfflineMutation()

  const todayISO = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const CASHUP_KEY = '/api/cashup?today=1'
  const { data, isLoading } = useSWR<{ cashUp: CashUp | null }>(CASHUP_KEY, fetcher)

  // Use the cashup session date for stats/expenses, not today's date
  // This ensures we get data for the actual cashup session (which may span past midnight)
  const sessionDate = data?.cashUp?.sessionDate?.split('T')[0] ?? todayISO

  const STATS_KEY    = `/api/cashup/live-stats?date=${sessionDate}`
  const EXPENSES_KEY = `/api/expenses?from=${sessionDate}&to=${sessionDate}&page=1`
  const MOMO_KEY     = `/api/momo-statements/by-date?date=${sessionDate}`

  const { data: statsData, mutate: refreshStats }    = useSWR<LiveStats>(STATS_KEY, fetcher)
  const { data: expensesData, mutate: refreshExpenses } = useSWR<{ expenses: ExpenseItem[] }>(EXPENSES_KEY, fetcher)
  const { data: momoData } = useSWR<{ statement: MomoStatementSummary | null }>(MOMO_KEY, fetcher)

  const cashUp   = data?.cashUp ?? null
  const stats    = statsData
  const expenses = expensesData?.expenses ?? []
  const momoStatement = momoData?.statement ?? null

  const EXPENSES_PAGE_SIZE = 3
  const [expensePage, setExpensePage] = useState(1)
  const expensePageCount = Math.max(1, Math.ceil(expenses.length / EXPENSES_PAGE_SIZE))
  useEffect(() => { setExpensePage(1) }, [sessionDate])
  useEffect(() => {
    if (expensePage > expensePageCount) setExpensePage(expensePageCount)
  }, [expensePage, expensePageCount])
  const pagedExpenses = expenses.slice(
    (expensePage - 1) * EXPENSES_PAGE_SIZE,
    expensePage * EXPENSES_PAGE_SIZE,
  )
  const isOnline = useOfflineStore((s) => s.isOnline)
  // A session opened while offline (see handleOpen) — its id is a local_
  // placeholder until the queued POST actually syncs. Full reconciliation
  // (live sales/purchases/payments totals) can't be computed offline, so
  // this session stays read-only — declare/submit — until it syncs for
  // real and the SWR cache picks up the authoritative record.
  const isProvisional = cashUp?.id?.startsWith('local_cashup_') ?? false

  // Cache "what would opening a session look like right now" while online
  // and no session is open, so handleOpen can safely offer a PROVISIONAL
  // open later if the connection drops before the operator gets to it.
  useEffect(() => {
    if (!isOnline || cashUp) return
    fetch(`/api/cashup/opening-balance-preview?date=${todayISO}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((preview) => {
        if (preview) {
          offlineDB.meta.put({
            key: `cashupOpeningPreview:${todayISO}`,
            value: JSON.stringify({ ...preview, cachedAt: Date.now() }),
          })
        }
      })
      .catch(() => {})
  }, [isOnline, cashUp, todayISO])

  const [approvingExpense, setApprovingExpense] = useState<string | null>(null)

  async function handleApproveExpense(id: string) {
    setApprovingExpense(id)
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, { method: 'POST' })
      if (res.ok) { refreshExpenses(); refreshStats() }
      else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed to approve expense') }
    } finally { setApprovingExpense(null) }
  }

  const [opening,    setOpening]    = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [rejecting,  setRejecting]  = useState(false)
  const [rejectReasonOpen, setRejectReasonOpen] = useState(false)
  const [notes,      setNotes]      = useState('')
  const [counts, setCounts] = useState<Record<number, number>>(() =>
    Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]))
  )

  const [countCashOpen, setCountCashOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [voidReasonOpen, setVoidReasonOpen] = useState(false)
  const [manageSessionsOpen, setManageSessionsOpen] = useState(false)
  const [previousReportsOpen, setPreviousReportsOpen] = useState(false)
  const [momoModalOpen, setMomoModalOpen] = useState(false)

  // Fetch all open sessions to show count
  const { data: openSessionsData, mutate: refreshOpenSessions } = useSWR<{ sessions: CashUp[] }>('/api/cashup/open-sessions', fetcher)
  const openSessions = openSessionsData?.sessions ?? []
  const openSessionsCount = openSessions.length

  async function handleVoidSession(reason: string) {
    if (!cashUp || !isManager) return

    setVoiding(true)
    try {
      const res = await fetch(`/api/cashup/${cashUp.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        // Await both — the UI must reflect the void before we call this
        // "done"; a fire-and-forget mutate here is what let the page show
        // a stale "session open" state after a success toast.
        await Promise.all([swrMutate(CASHUP_KEY), swrMutate('/api/cashup/open-sessions')])
        toast.success('Session voided')
        setVoidReasonOpen(false)
      } else {
        const j = await res.json()
        toast.error(j.error ?? 'Failed to void session')
      }
    } catch {
      toast.error('Failed to void session')
    } finally {
      setVoiding(false)
    }
  }

  const declaredCash = DENOMINATIONS.reduce(
    (acc, d) => acc.plus(new Decimal(counts[d] ?? 0).times(d).div(100)),
    new Decimal(0)
  )
  const hasCounted = !declaredCash.isZero()

  async function handleOpen() {
    setOpening(true)
    try {
      const { queued, data: result } = await offlineMutate({
        method: 'POST', url: '/api/cashup',
        body: { sessionDate: todayISO },
        localId: `local_cashup_${todayISO}`,
      })
      if (queued) {
        // A provisional open is only offered when we have a cached preview
        // confirming the opening balance is safely known (not one that
        // needs live transaction aggregation from a still-open previous
        // session) — see previewOpeningBalance's own comment for why.
        const cached = await offlineDB.meta.get(`cashupOpeningPreview:${todayISO}`)
        const preview = cached
          ? JSON.parse(cached.value) as { canOpen: boolean; reason?: string; safeOpeningBalance?: string }
          : null

        if (preview?.canOpen && preview.safeOpeningBalance) {
          const provisional: CashUp = {
            id: `local_cashup_${todayISO}`,
            sessionDate: todayISO,
            currency: 'ZAR',
            status: 'open',
            openedByUserId: session?.user?.id ?? '',
            openedAt: new Date().toISOString(),
            openingBalance: preview.safeOpeningBalance,
            systemCashSales: '0',
            systemCashPurchases: '0',
            systemCashPayments: '0',
            systemCashExpected: preview.safeOpeningBalance,
            expensesTotal: '0',
            cardPaymentsTotal: '0',
            drawingsReceived: '0',
            loansTotal: '0',
          }
          await swrMutate(CASHUP_KEY, { cashUp: provisional }, { revalidate: false })
          toast.success('Session provisionally opened offline — will finalize once reconnected')
        } else {
          toast.success(
            preview?.reason
              ? `Session queued, but opening balance can't be confirmed offline: ${preview.reason}`
              : 'Cash-up session queued — will open when connected'
          )
        }
      } else {
        // Seed the SWR cache straight from the POST response instead of
        // firing an unawaited re-fetch — the response already IS the
        // authoritative session, so there's no need for (or wait on) a
        // second network round-trip. This was the exact gap that let the
        // page show "success" while the panel stayed stuck on "no session"
        // under network lag.
        await swrMutate(CASHUP_KEY, result, { revalidate: false })
        toast.success('Cash-up session opened')
      }
    } catch { toast.error('Failed to open session') }
    finally { setOpening(false) }
  }

  async function handleCurrencyChange(newCurrency: Currency) {
    if (!cashUp) return
    try {
      const res = await fetch(`/api/cashup/${cashUp.id}/currency`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: newCurrency }),
      })
      if (res.ok) {
        await swrMutate(CASHUP_KEY)
        toast.success(`Currency changed to ${CURRENCY_LABELS[newCurrency]}`)
      } else {
        const j = await res.json()
        toast.error(j.error ?? 'Failed to update currency')
      }
    } catch {
      toast.error('Failed to update currency')
    }
  }

  async function handleSubmit() {
    if (!cashUp) return
    setSubmitting(true)
    const denoms: Record<string, number> = {}
    for (const d of DENOMINATIONS) { const c = counts[d] ?? 0; if (c > 0) denoms[String(d)] = c }
    try {
      const { queued } = await offlineMutate({
        method: 'PUT', url: `/api/cashup/${cashUp.id}`,
        body: {
          denominations: denoms,
          declaredCash:  declaredCash.toNumber(),
          notes:         notes || undefined,
        },
        localId: cashUp.id,
      })
      if (queued) {
        toast.success('Cash-up saved offline — will submit when connected')
      } else {
        await swrMutate(CASHUP_KEY)
        toast.success('Cash-up submitted for approval')
      }
    } catch (err) {
      let msg = 'Failed to submit cash-up'
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string }
          if (parsed.error) msg = parsed.error
        } catch { /* not JSON — keep default message */ }
      }
      toast.error(msg)
    }
    finally { setSubmitting(false) }
  }

  async function handleApprove() {
    if (!cashUp) return
    setApproving(true)
    try {
      const res = await fetch(`/api/cashup/${cashUp.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        await Promise.all([swrMutate(CASHUP_KEY), refreshStats()])
        toast.success('Cash-up approved')
      } else {
        const j = await res.json()
        toast.error(j.error ?? 'Failed to approve cash-up')
      }
    } catch {
      toast.error('Failed to approve cash-up')
    } finally {
      setApproving(false)
    }
  }

  async function handleReject(reason: string) {
    if (!cashUp) return
    setRejecting(true)
    try {
      const res = await fetch(`/api/cashup/${cashUp.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        await Promise.all([swrMutate(CASHUP_KEY), refreshStats()])
        toast.success('Cash-up rejected — sent back to cashier')
        setRejectReasonOpen(false)
      } else {
        const j = await res.json()
        toast.error(j.error ?? 'Failed to reject cash-up')
      }
    } catch {
      toast.error('Failed to reject cash-up')
    } finally {
      setRejecting(false)
    }
  }

  if (isLoading) {
    return (
      <PortalPage title="Cash-Up">
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: colors.textSecondary }}>
          Loading…
        </div>
      </PortalPage>
    )
  }

  // Check if viewing previous day's session
  const isPreviousDay = cashUp && cashUp.status === 'open' && sessionDate !== todayISO

  return (
    <PortalPage title="Cash-Up">
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="max-w-6xl mx-auto w-full space-y-2.5 pb-4" style={{ padding: '8px 8px 0' }}>

        {/* No session */}
        {!cashUp && (
          <div style={PANEL}>
            <div style={PANEL_HEAD}>
              <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Today&apos;s Session</span>
            </div>
            <div className="p-6 text-center">
            <Clock className="w-9 h-9 mx-auto mb-2.5" style={{ color: colors.border }} />
            <p className="font-medium mb-1" style={{ color: colors.textPrimary }}>No session open for today</p>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>Open a session to begin tracking today&apos;s cash.</p>
            <Btn loading={opening} onClick={handleOpen} style={{ margin: '0 auto' }}>
              Open Session
            </Btn>
            </div>
          </div>
        )}

        {cashUp && (
          <>
            {/* Provisional (opened offline, not yet synced) — full totals need
                a live sync, so this session stays view-only until then. */}
            {isProvisional && (
              <div style={{ border: `1px solid ${colors.alertBorder}`, borderRadius: 3, overflow: 'hidden', background: colors.alertBg }}>
                <div className="px-3 py-2.5">
                  <p className="font-semibold text-sm mb-1" style={{ color: colors.alertIcon }}>
                    Session provisionally opened — pending sync
                  </p>
                  <p className="text-sm" style={{ color: colors.alertText }}>
                    This session was opened while offline. The opening balance shown is confirmed, but sales/purchases/payment
                    totals can&apos;t be calculated until this device reconnects. Counting and submitting cash is disabled until then.
                  </p>
                </div>
              </div>
            )}

            {/* Previous day warning — must submit before starting new day */}
            {cashUp.status === 'open' && sessionDate !== todayISO && (
              <div style={{ border: `1px solid ${colors.danger}`, borderRadius: 3, overflow: 'hidden', background: colors.dangerBg }}>
                <div className="px-3 py-2.5">
                  <p className="font-semibold text-sm mb-1" style={{ color: colors.danger }}>
                    ⚠ Previous Day&apos;s Cash-Up Not Submitted
                    {openSessionsCount > 1 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs" style={{ background: colors.danger, color: '#fff' }}>
                        {openSessionsCount} open sessions
                      </span>
                    )}
                  </p>
                  <p className="text-sm mb-3" style={{ color: colors.textPrimary }}>
                    You have an open session from <strong>{sessionDate}</strong> that needs to be submitted before you can start today&apos;s session.
                    {openSessionsCount > 1
                      ? ' You have multiple old sessions — submit or void each one to proceed.'
                      : ' Count your cash and submit below, or void this session if you cannot reconcile.'}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Btn size="sm" variant="danger" loading={voiding} onClick={() => setVoidReasonOpen(true)}>
                      Void This Session
                    </Btn>
                    {openSessionsCount > 1 && (
                      <Btn size="sm" onClick={() => setManageSessionsOpen(true)}>
                        Manage All {openSessionsCount} Sessions
                      </Btn>
                    )}
                    <span className="text-xs self-center" style={{ color: colors.textSecondary }}>
                      (Cannot reconcile? Void to skip this session)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Rejection notice — manager sent this session back for correction */}
            {cashUp.status === 'open' && cashUp.rejectionReason && (
              <div style={{ border: `1px solid ${colors.danger}`, borderRadius: 3, overflow: 'hidden', background: colors.dangerBg }}>
                <div className="px-3 py-2.5">
                  <p className="font-semibold text-sm mb-1" style={{ color: colors.danger }}>
                    ⚠ This Session Was Rejected
                  </p>
                  <p className="text-sm" style={{ color: colors.textPrimary }}>
                    Reason: {cashUp.rejectionReason}
                    {cashUp.rejectedAt && <span style={{ color: colors.textSecondary }}> ({new Date(cashUp.rejectedAt).toLocaleString('en-ZA')})</span>}
                  </p>
                </div>
              </div>
            )}

            {/* Zero-float warning */}
            {cashUp.status === 'open' && new Decimal(cashUp.openingBalance ?? '0').isZero() && (
              <div className="flex items-center gap-2 rounded px-3 py-2 text-sm" style={{ background: colors.warningBg, color: colors.warning }}>
                <span className="font-semibold">⚠ Opening balance is {CURRENCY_SYMBOLS[cashUp.currency ?? 'ZAR']} 0.00.</span>
                <span>Set today&apos;s float in the</span>
                <a href="/app/float" className="underline font-medium">Float module</a>
                <span>before submitting.</span>
              </div>
            )}

            {/* Status + refresh row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: colors.textMuted }}>{sessionDate}</span>
                {cashUp.status === 'open' && isPreviousDay && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.dangerBg, color: colors.danger }}>Previous Day — Submit Required</span>}
                {cashUp.status === 'open' && !isPreviousDay && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.warningBg, color: colors.warning }}>Open</span>}
                {cashUp.status === 'submitted' && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.processBg, color: colors.process }}>Submitted — Awaiting Approval</span>}
                {cashUp.status === 'approved'  && <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.actionBg, color: colors.action }}><CheckCircle2 className="w-3 h-3" />Approved</span>}
                {cashUp.approvedAt && <span className="text-xs" style={{ color: colors.textMuted }}>{new Date(cashUp.approvedAt).toLocaleString('en-ZA')}</span>}
              </div>
              {cashUp.status === 'open' && (
                <button onClick={() => refreshStats()} className="flex items-center gap-1 text-xs font-medium" style={{ color: colors.textSecondary }}>
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              )}
            </div>


            {/* ── 2-column layout: left = reconciliation, right = count + panels ── */}
            {(() => {
              const isOpen    = cashUp.status === 'open'
              const currSym   = CURRENCY_SYMBOLS[cashUp.currency ?? 'ZAR']
              const opening   = new Decimal(cashUp.openingBalance ?? '0')
              const draw      = new Decimal(isOpen ? (stats?.floatTopUps ?? '0') : (cashUp.drawingsReceived ?? '0'))
              const totalCash = opening.plus(draw)
              const cashSales = new Decimal(isOpen ? (stats?.cashSales    ?? '0') : cashUp.systemCashSales)
              const cashPurch = new Decimal(isOpen ? (stats?.cashPurchases ?? '0') : cashUp.systemCashPurchases)
              const cashPay   = new Decimal(isOpen ? (stats?.cashPayments  ?? '0') : cashUp.systemCashPayments)
              const exp       = new Decimal(isOpen ? (stats?.expenses      ?? '0') : (cashUp.expensesTotal ?? '0'))
              const loanAdv   = new Decimal(stats?.loanAdvance   ?? '0')
              const loanRep   = new Decimal(stats?.loanRepayment ?? '0')
              const moneySpent = cashPurch.plus(cashPay).plus(exp).plus(loanAdv)
              const netCash    = totalCash.minus(moneySpent)
              const calFloat  = totalCash.plus(cashSales).minus(cashPurch).minus(cashPay).minus(exp).minus(loanAdv).plus(loanRep)
              const declared  = isOpen ? declaredCash : new Decimal(cashUp.declaredCash ?? '0')
              const balance   = declared.minus(calFloat)
              const finCum    = new Decimal(stats?.finPeriodCumulative ?? '0')
              const cardSalesLive = new Decimal(stats?.cardSales ?? '0')
              const nonCashAdvancedLive = new Decimal(stats?.nonCashAdvanced ?? '0')
              // Live, date-scoped counts for this session — used to grey out a
              // report button when there's nothing for it to report, regardless
              // of whether the session is still open or already submitted.
              const cardOnlySalesLive = new Decimal(stats?.cardOnlySales ?? '0')
              const transferredPurchasesLive = new Decimal(stats?.transferredPurchases ?? '0')
              const unpaidTodayCount = stats?.unpaidToday?.count ?? 0
              const unpaidAllTimeCount = stats?.unpaidAllTime?.count ?? 0

              return (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">

                  {/* ── LEFT: reconciliation ledger (always compact) ─────────── */}
                  <div className="lg:col-span-3" style={PANEL}>
                    <div style={PANEL_HEAD}>
                      <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>
                        {isOpen ? 'Reconciliation (Live)' : 'Reconciliation'}
                      </span>
                    </div>

                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                        {/* Currency selector — first row */}
                        <tr style={{ borderBottom: '2px solid #B0B0B0' }}>
                          <td style={{ height: 26, padding: '2px 8px', fontSize: 12, color: colors.textSecondary }}>Currency</td>
                          <td colSpan={2} style={{ padding: '2px 8px', textAlign: 'right' }}>
                            {isOpen && !isProvisional ? (
                              <select
                                value={cashUp.currency ?? 'ZAR'}
                                onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
                                style={{ ...inp, width: 'auto', height: 26, fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer' }}
                              >
                                <option value="ZAR">R - South African Rand</option>
                                <option value="SZL">E - Eswatini Lilangeni</option>
                              </select>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <span className="font-mono font-semibold" style={{ color: colors.textPrimary }}>
                                  {CURRENCY_SYMBOLS[cashUp.currency ?? 'ZAR']}
                                </span>
                                <span className="text-xs" style={{ color: colors.textSecondary }}>
                                  ({CURRENCY_LABELS[cashUp.currency ?? 'ZAR']})
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>

                        <ReconRow label="Opening Balance" value={opening.toFixed(2)} positive currencySymbol={currSym} />
                        <ReconRow
                          label="Drawings Received (+)" value={draw.toFixed(2)} positive currencySymbol={currSym}
                          action={cashUp && <ReportButton type="drawings-received" sessionId={cashUp.id} disabled={draw.isZero()} />}
                        />
                        <ReconRow label="Total Cash" value={totalCash.toFixed(2)} subtotal currencySymbol={currSym} />

                        <ReconRow
                          divider
                          label="Cash Received / Sales (+)" value={cashSales.toFixed(2)} positive currencySymbol={currSym}
                          action={cashUp && <ReportButton type="cash-sales" sessionId={cashUp.id} disabled={cashSales.isZero()} />}
                        />
                        {isOpen && cardSalesLive.gt(0) && (
                          <ReconRow label="Card / EFT Sales (not in drawer)" value={cardSalesLive.toFixed(2)} muted currencySymbol={currSym} />
                        )}
                        {isOpen && nonCashAdvancedLive.gt(0) && (
                          <ReconRow label="Non-Cash Loan Advances (excluded)" value={nonCashAdvancedLive.toFixed(2)} muted currencySymbol={currSym} />
                        )}
                        <ReconRow
                          label="Cash Purchases (−)" value={cashPurch.toFixed(2)} negative currencySymbol={currSym}
                          action={cashUp && <ReportButton type="cash-purchases" sessionId={cashUp.id} disabled={cashPurch.isZero()} />}
                        />
                        <ReconRow
                          label="Account Payments (−)" value={cashPay.toFixed(2)} negative currencySymbol={currSym}
                          action={cashUp && <ReportButton type="account-payments" sessionId={cashUp.id} disabled={cashPay.isZero()} />}
                        />
                        <ReconRow
                          label="Expenses (−)" value={exp.toFixed(2)} negative currencySymbol={currSym}
                          action={cashUp && <ReportButton type="expenses" sessionId={cashUp.id} disabled={exp.isZero()} />}
                        />
                        <ReconRow
                          label="Loan Advance (−)" value={loanAdv.toFixed(2)} negative currencySymbol={currSym}
                          action={cashUp && <ReportButton type="loan-advances" sessionId={cashUp.id} disabled={loanAdv.isZero()} />}
                        />
                        <ReconRow
                          label="Loans Repayment (+)" value={loanRep.toFixed(2)} positive currencySymbol={currSym}
                          action={cashUp && <ReportButton type="loan-repayments" sessionId={cashUp.id} disabled={loanRep.isZero()} />}
                        />

                        <ReconRow divider label="Money Spent (−)" value={moneySpent.toFixed(2)} subtotal negative currencySymbol={currSym} />
                        <ReconRow label="Net Cash" value={netCash.toFixed(2)} subtotal currencySymbol={currSym} />
                        <ReconRow divider label="Cal Float (Expected in Drawer)" value={calFloat.toFixed(2)} subtotal currencySymbol={currSym} />

                        <ReconRow
                          divider
                          label="Cash On Hand (Counted)" value={declared.toFixed(2)} highlight currencySymbol={currSym}
                          action={isOpen && !isProvisional && (
                            <Btn
                              size="sm" icon={Calculator}
                              onClick={() => setCountCashOpen(true)}
                              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                            >
                              Count Cash
                            </Btn>
                          )}
                        />
                        {isOpen && !hasCounted ? (
                          <tr>
                            <td colSpan={2} style={{ padding: 0 }}>
                              <div className="flex justify-between items-center px-2 py-1.5 text-sm" style={{ background: colors.toolbar }}>
                                <span style={{ color: colors.textSecondary }}>Balance (Variance)</span>
                                <span className="text-xs italic" style={{ color: colors.textSecondary }}>Count cash to see</span>
                              </div>
                            </td>
                            <td style={{ width: 1 }} />
                          </tr>
                        ) : (
                          <VarianceRow variance={balance.toFixed(2)} currencySymbol={currSym} />
                        )}

                        <tr style={{ borderTop: '2px solid #B0B0B0' }}>
                          <td style={{ height: 26, padding: '2px 8px', fontSize: 12, fontWeight: 500, color: colors.textSecondary }}>
                            Fin Period Cumulative Balance
                          </td>
                          <td className="font-mono text-right" style={{ padding: '2px 8px', fontSize: 12, fontWeight: 500, color: finCum.isZero() ? colors.textSecondary : finCum.gte(0) ? colors.process : colors.danger, whiteSpace: 'nowrap' }}>
                            {finCum.gt(0) ? '+' : ''}{currSym} {finCum.toFixed(2)}
                          </td>
                          <td style={{ width: 1 }} />
                        </tr>
                      </tbody>
                    </table>

                    {/* Submitted denomination breakdown (not open) */}
                    {cashUp.status !== 'open' && cashUp.denominations && Object.keys(cashUp.denominations).length > 0 && (
                      <div style={{ padding: '8px 10px', borderTop: CARD_BORDER }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textSecondary }}>Denomination Breakdown</p>
                        <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                          {DENOMINATIONS.map((d) => {
                            const c = cashUp.denominations![String(d)] ?? 0
                            if (c === 0) return null
                            const val = new Decimal(c).times(d).div(100)
                            return (
                              <div key={d} className="flex items-center gap-1.5 text-xs">
                                <span className="font-mono font-semibold w-8 text-right shrink-0" style={{ color: colors.textPrimary }}>{DENOMINATION_LABELS[d]}</span>
                                <span style={{ color: colors.textSecondary }}>×{c}</span>
                                <span className="font-mono ml-auto" style={{ color: colors.textPrimary }}>{currSym} {val.toFixed(2)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Notes (submitted/approved) */}
                    {cashUp.status !== 'open' && cashUp.notes && (
                      <p className="text-sm italic" style={{ padding: '8px 10px', borderTop: CARD_BORDER, color: colors.textSecondary }}>
                        &quot;{cashUp.notes}&quot;
                      </p>
                    )}

                    {/* Approve / Reject / Void buttons */}
                    {cashUp.status === 'submitted' && (
                      <div className="flex justify-end gap-2" style={{ padding: '8px 10px', borderTop: CARD_BORDER, background: colors.toolbar }}>
                        {isManager ? (
                          <>
                            <Btn size="sm" loading={voiding} onClick={() => setVoidReasonOpen(true)}>
                              Void
                            </Btn>
                            <Btn
                              size="sm"
                              variant="danger"
                              loading={rejecting}
                              onClick={() => setRejectReasonOpen(true)}
                            >
                              Reject — Send Back to Cashier
                            </Btn>
                            <Btn size="sm" icon={Lock} loading={approving} onClick={handleApprove}>
                              Approve Cash-Up
                            </Btn>
                          </>
                        ) : (
                          <p className="text-sm" style={{ color: colors.textSecondary }}>Awaiting manager approval</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── RIGHT: denomination count (open) + panels ────────────── */}
                  <div className="lg:col-span-2 flex flex-col gap-2.5">

                    {/* Stat tiles — 2-up grid instead of stacked cards */}
                    <div className="grid grid-cols-2 gap-2">
                      <StatTile
                        label="Today Unpaid"
                        value={`${currSym} ${new Decimal(stats?.unpaidToday?.total ?? '0').toFixed(2)}`}
                        valueColor={colors.danger}
                        sub={`${stats?.unpaidToday?.count ?? 0} purchase${(stats?.unpaidToday?.count ?? 0) !== 1 ? 's' : ''}`}
                        action={<ReportButton type="unpaid-today" sessionId={cashUp.id} disabled={unpaidTodayCount === 0} />}
                      />
                      <StatTile
                        label="Total Unpaid"
                        value={`${currSym} ${new Decimal(stats?.unpaidAllTime?.total ?? '0').toFixed(2)}`}
                        valueColor={colors.danger}
                        sub={`${stats?.unpaidAllTime?.count ?? 0} purchase${(stats?.unpaidAllTime?.count ?? 0) !== 1 ? 's' : ''}`}
                        action={<ReportButton type="unpaid-all" sessionId="" standalone disabled={unpaidAllTimeCount === 0} />}
                      />
                      {!isOpen && new Decimal(cashUp.cardPaymentsTotal ?? '0').gt(0) && (
                        <StatTile
                          label="Card / EFT Sales"
                          value={`${currSym} ${new Decimal(cashUp.cardPaymentsTotal).toFixed(2)}`}
                          valueColor={colors.process}
                          sub="Excluded from cash reconciliation"
                        />
                      )}
                      {!isOpen && stats?.nonCashAdvanced && new Decimal(stats.nonCashAdvanced).gt(0) && (
                        <StatTile
                          label="Non-Cash Loan Adv."
                          value={`${currSym} ${new Decimal(stats.nonCashAdvanced).toFixed(2)}`}
                          valueColor={colors.process}
                          sub="EFT/cheque — excluded from cash"
                        />
                      )}
                    </div>
                    {!isOpen && stats?.cardOnlySales && new Decimal(stats.cardOnlySales).gt(0) && (
                      <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        Of which true card-swipe sales: {currSym} {new Decimal(stats.cardOnlySales).toFixed(2)} (see &quot;Card Sales&quot; report)
                      </p>
                    )}

                    {/* Reports */}
                    <div style={PANEL}>
                      <div style={PANEL_HEAD}>
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Reports</span>
                      </div>
                      <div>
                        {[
                          { key: 'card-sales' as const, label: 'Card Sales', disabled: cardOnlySalesLive.isZero() },
                          { key: 'transferred-purchases' as const, label: 'Transferred Purchases', disabled: transferredPurchasesLive.isZero() },
                        ].map((r, i) => (
                          <div
                            key={r.key}
                            className="flex items-center justify-between"
                            style={{ padding: '5px 10px', borderTop: i > 0 ? '1px solid #E8E8E8' : undefined }}
                          >
                            <span style={{ fontSize: 12, color: colors.textPrimary }}>{r.label}</span>
                            <ReportButton type={r.key} sessionId={cashUp.id} disabled={r.disabled} />
                          </div>
                        ))}
                        <div className="flex items-center justify-between" style={{ padding: '5px 10px', borderTop: '1px solid #E8E8E8' }}>
                          <span style={{ fontSize: 12, color: colors.textPrimary }}>Previous Reports</span>
                          <Btn size="sm" icon={FolderOpen} onClick={() => setPreviousReportsOpen(true)}>
                            Browse
                          </Btn>
                        </div>
                      </div>
                    </div>

                    {/* Today's Expenses */}
                    {expenses.length > 0 && (
                      <div style={PANEL}>
                        <div className="flex items-center justify-between" style={PANEL_HEAD}>
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Today&apos;s Expenses</span>
                          {expensePageCount > 1 && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                                disabled={expensePage <= 1}
                                className="disabled:opacity-30"
                                style={{ color: colors.textSecondary }}
                                aria-label="Previous expenses"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-[10px] tabular-nums" style={{ color: colors.textSecondary }}>
                                {expensePage} / {expensePageCount}
                              </span>
                              <button
                                onClick={() => setExpensePage((p) => Math.min(expensePageCount, p + 1))}
                                disabled={expensePage >= expensePageCount}
                                className="disabled:opacity-30"
                                style={{ color: colors.textSecondary }}
                                aria-label="Next expenses"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          {pagedExpenses.map((e, i) => (
                            <div
                              key={e.id}
                              className="flex items-start justify-between gap-2"
                              style={{ padding: '5px 10px', borderTop: i > 0 ? '1px solid #E8E8E8' : undefined }}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: colors.textPrimary }}>{e.description || e.expenseType.name}</p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{e.expenseType.name} · {e.paymentMethod}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-mono font-semibold text-xs" style={{ color: colors.textPrimary }}>{currSym} {new Decimal(e.amount).toFixed(2)}</p>
                                {e.status === 'approved' ? (
                                  <span className="text-[10px] font-medium" style={{ color: colors.action }}>✓ approved</span>
                                ) : isManager ? (
                                  <button
                                    onClick={() => handleApproveExpense(e.id)}
                                    disabled={approvingExpense === e.id}
                                    className="text-[10px] font-medium underline disabled:opacity-50"
                                    style={{ color: colors.warning }}
                                  >
                                    {approvingExpense === e.id ? 'Approving…' : 'Approve'}
                                  </button>
                                ) : (
                                  <span className="text-[10px]" style={{ color: colors.textSecondary }}>pending</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* MoMo Statement — cross-check against the day's uploaded provider
                        statement. Purely informational: never feeds the cash-up formula,
                        just sits here for a manager to eyeball against Cash Purchases /
                        Account Payments above. Upload + results open in a popup so the
                        cashier never has to leave this page. */}
                    <button
                      onClick={() => setMomoModalOpen(true)}
                      className="w-full text-left"
                      style={{ ...PANEL, cursor: 'pointer', border: `1px solid ${colors.border}` }}
                    >
                      <div className="flex items-center justify-between" style={PANEL_HEAD}>
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>MoMo Statement</span>
                        <span className="text-[10px] font-medium underline" style={{ color: colors.action }}>
                          {momoStatement ? 'View' : 'Upload'}
                        </span>
                      </div>
                      {momoStatement ? (
                        <div className="grid grid-cols-3 gap-2" style={{ padding: '8px 10px' }}>
                          <div>
                            <p style={{ fontSize: 10, color: colors.textSecondary }}>Sent</p>
                            <p className="font-mono font-semibold text-xs" style={{ color: colors.process }}>
                              {currSym} {new Decimal(momoStatement.totalSent).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: colors.textSecondary }}>Received</p>
                            <p className="font-mono font-semibold text-xs" style={{ color: colors.action }}>
                              {currSym} {new Decimal(momoStatement.totalReceived).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: colors.textSecondary }}>Fees</p>
                            <p className="font-mono font-semibold text-xs" style={{ color: colors.textPrimary }}>
                              {currSym} {new Decimal(momoStatement.totalFees).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 11, color: colors.textSecondary, padding: '8px 10px' }}>
                          No statement uploaded for {sessionDate} yet.
                        </p>
                      )}
                    </button>
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>
      </div>

      {countCashOpen && (() => {
        // Calculate expected cash in drawer for the modal
        const currSym   = CURRENCY_SYMBOLS[cashUp?.currency ?? 'ZAR']
        const opening   = new Decimal(cashUp?.openingBalance ?? '0')
        const draw      = new Decimal(stats?.floatTopUps ?? '0')
        const totalCash = opening.plus(draw)
        const cashSales = new Decimal(stats?.cashSales ?? '0')
        const cashPurch = new Decimal(stats?.cashPurchases ?? '0')
        const cashPay   = new Decimal(stats?.cashPayments ?? '0')
        const exp       = new Decimal(stats?.expenses ?? '0')
        const loanAdv   = new Decimal(stats?.loanAdvance ?? '0')
        const loanRep   = new Decimal(stats?.loanRepayment ?? '0')
        const expectedCash = totalCash.plus(cashSales).minus(cashPurch).minus(cashPay).minus(exp).minus(loanAdv).plus(loanRep)

        return (
          <CountCashModal
            counts={counts} setCounts={setCounts}
            notes={notes} setNotes={setNotes}
            submitting={submitting} handleSubmit={handleSubmit}
            onClose={() => setCountCashOpen(false)}
            expectedCash={expectedCash}
            currencySymbol={currSym}
          />
        )
      })()}

      {manageSessionsOpen && openSessions.length > 0 && (
        <ManageSessionsModal
          sessions={openSessions}
          onClose={() => setManageSessionsOpen(false)}
          onVoided={async () => {
            await Promise.all([refreshOpenSessions(), swrMutate(CASHUP_KEY)])
          }}
          currencySymbol={CURRENCY_SYMBOLS[cashUp?.currency ?? 'ZAR']}
        />
      )}

      {previousReportsOpen && (
        <PreviousReportsModal onClose={() => setPreviousReportsOpen(false)} />
      )}

      {momoModalOpen && (
        <MomoStatementModal
          sessionDate={sessionDate}
          currSym={CURRENCY_SYMBOLS[cashUp?.currency ?? 'ZAR']}
          onClose={() => setMomoModalOpen(false)}
          onUploaded={() => swrMutate(MOMO_KEY)}
        />
      )}

      {voidReasonOpen && (
        <ReasonModal
          title="Void Cash-Up Session"
          message="Voiding this session cannot be undone. Please provide a reason."
          confirmLabel="Void Session"
          loading={voiding}
          onConfirm={handleVoidSession}
          onClose={() => setVoidReasonOpen(false)}
        />
      )}

      {rejectReasonOpen && (
        <ReasonModal
          title="Reject Cash-Up"
          message="This will send the session back to the cashier for correction. Please provide a reason."
          confirmLabel="Reject — Send Back"
          loading={rejecting}
          onConfirm={handleReject}
          onClose={() => setRejectReasonOpen(false)}
        />
      )}
    </PortalPage>
  )
}
