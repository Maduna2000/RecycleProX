'use client'

import { useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import {
  ArrowLeft, CheckCircle, Trash2, Paperclip, Eye, Loader2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Windows aesthetic styles
const secBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary, cursor: 'pointer',
}
const priBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.action, border: `1px solid ${colors.actionHover}`, color: colors.textOnDark, cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.surface, border: `1px solid ${colors.danger}`, color: colors.danger, cursor: 'pointer',
}

type ExpenseDetail = {
  id: string; refNumber: string; description: string
  amount: string; vatAmount: string; includesVat: boolean
  paymentMethod: string; chequeNo?: string | null
  status: string; cashUpId?: string | null
  createdAt: string; approvedAt?: string | null; approvedById?: string | null
  expenseType: { name: string }
  attachments: { id: string; fileName: string; r2Key: string; notes?: string | null; uploadedAt: string }[]
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    approved: { background: colors.actionBg, color: colors.action, border: `1px solid ${colors.action}` },
    pending: { background: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}` },
    voided: { background: colors.dangerBg, color: colors.danger, border: `1px solid ${colors.danger}` },
  }
  const labels: Record<string, string> = { approved: 'Approved', pending: 'Pending', voided: 'Voided' }
  return (
    <span style={{ ...styles[status], padding: '2px 6px', borderRadius: 2, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
      {labels[status] ?? status}
    </span>
  )
}

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const isMgr = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: expense, mutate: mutateExpense, isLoading } =
    useSWR<ExpenseDetail>(`/api/expenses/${id}`, fetcher)

  const { data: attachments, mutate: mutateAttachments } =
    useSWR<ExpenseDetail['attachments']>(`/api/expenses/${id}/attachments`, fetcher)

  const [approving, setApproving] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleApprove() {
    setApproving(true)
    const res = await fetch(`/api/expenses/${id}/approve`, { method: 'POST' })
    setApproving(false)
    if (res.ok) { toast.success('Expense approved'); mutateExpense() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to approve') }
  }

  async function handleVoid() {
    if (!confirm('Void this expense? This cannot be undone.')) return
    setVoiding(true)
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    setVoiding(false)
    if (res.ok) { toast.success('Expense voided'); router.push('/app/expenses') }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void') }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('File too large — max 20 MB'); return }
    setUploading(true)
    try {
      const presignRes = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'expense_attachment', referenceId: id, contentType: file.type, fileSize: file.size }),
      })
      if (!presignRes.ok) { toast.error('Failed to get upload URL'); return }
      const { uploadUrl, key } = await presignRes.json()

      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!uploadRes.ok) { toast.error('Upload failed'); return }

      const saveRes = await fetch(`/api/expenses/${id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2Key: key, fileName: file.name }),
      })
      if (saveRes.ok) { toast.success('Attachment uploaded'); mutateAttachments() }
      else { toast.error('Failed to save attachment') }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleView(r2Key: string) {
    const res = await fetch(`/api/r2/view-url?key=${encodeURIComponent(r2Key)}`)
    if (res.ok) { const { url } = await res.json(); window.open(url, '_blank') }
    else toast.error('Failed to get view URL')
  }

  async function handleDelete(attachId: string) {
    if (!confirm('Delete this attachment?')) return
    const res = await fetch(`/api/expenses/${id}/attachments/${attachId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Attachment deleted'); mutateAttachments() }
    else toast.error('Failed to delete attachment')
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary }}>
        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!expense) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary, fontSize: 13 }}>
        Expense not found
      </div>
    )
  }

  const isPending = expense.status === 'pending'
  const isVoided = expense.status === 'voided'
  const attachList = attachments ?? expense.attachments ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 8 }}>
      {/* Main container with Windows border */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar with gradient */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <button onClick={() => router.push('/app/expenses')} style={{ ...secBtn, padding: '0 6px' }}>
            <ArrowLeft style={{ width: 12, height: 12 }} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary, fontFamily: 'monospace' }}>{expense.refNumber}</span>
          <StatusBadge status={expense.status} />
          <span style={{ fontSize: 10, color: colors.textSecondary, padding: '2px 6px', background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2 }}>
            {expense.expenseType.name}
          </span>
          <div style={{ flex: 1 }} />
        </div>

        {/* Voided banner */}
        {isVoided && (
          <div style={{ padding: '8px 12px', background: colors.dangerBg, borderBottom: `1px solid ${colors.danger}`, flexShrink: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: colors.danger }}>This expense has been voided</p>
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Expense info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Left: Expense details */}
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Expense Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
                <span style={{ color: colors.textSecondary }}>Reference:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: colors.textPrimary }}>{expense.refNumber}</span>
                <span style={{ color: colors.textSecondary }}>Category:</span>
                <span style={{ color: colors.textPrimary }}>{expense.expenseType.name}</span>
                <span style={{ color: colors.textSecondary }}>Payment:</span>
                <span style={{ color: colors.textPrimary, textTransform: 'capitalize' }}>{expense.paymentMethod}</span>
                {expense.chequeNo && (
                  <>
                    <span style={{ color: colors.textSecondary }}>Cheque No:</span>
                    <span style={{ fontFamily: 'monospace', color: colors.textPrimary }}>{expense.chequeNo}</span>
                  </>
                )}
                <span style={{ color: colors.textSecondary }}>Created:</span>
                <span style={{ color: colors.textPrimary }}>{new Date(expense.createdAt).toLocaleString('en-ZA')}</span>
                {expense.approvedAt && (
                  <>
                    <span style={{ color: colors.textSecondary }}>Approved:</span>
                    <span style={{ color: colors.textPrimary }}>{new Date(expense.approvedAt).toLocaleString('en-ZA')}</span>
                  </>
                )}
              </div>
            </div>

            {/* Right: Amount info */}
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Amount</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
                <span style={{ color: colors.textSecondary }}>Amount:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: colors.action }}>R {new Decimal(expense.amount).toFixed(2)}</span>
                <span style={{ color: colors.textSecondary }}>VAT:</span>
                <span style={{ fontFamily: 'monospace', color: colors.textPrimary }}>
                  {expense.includesVat ? `R ${new Decimal(expense.vatAmount).toFixed(2)}` : '—'}
                </span>
                <span style={{ color: colors.textSecondary }}>Cash-Up:</span>
                <span style={{ fontFamily: 'monospace', color: expense.cashUpId ? colors.textPrimary : colors.textSecondary, fontSize: 10 }}>
                  {expense.cashUpId ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
            <p style={{ fontSize: 12, color: colors.textPrimary }}>{expense.description}</p>
          </div>

          {/* Attachments */}
          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Paperclip style={{ width: 12, height: 12, color: colors.textSecondary }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>Attachments</span>
                {attachList.length > 0 && <span style={{ fontSize: 10, color: colors.textSecondary }}>({attachList.length})</span>}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  style={{ display: 'none' }}
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{ ...secBtn, opacity: uploading ? 0.5 : 1 }}
                >
                  {uploading
                    ? <><Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} /> Uploading…</>
                    : <><Upload style={{ width: 11, height: 11 }} /> Upload Slip</>}
                </button>
              </div>
            </div>

            <div style={{ padding: 12 }}>
              {attachList.length === 0 ? (
                <p style={{ fontSize: 12, textAlign: 'center', padding: '24px 0', color: colors.textSecondary }}>
                  No attachments yet — upload a receipt or slip above.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {attachList.map((a) => (
                    <div
                      key={a.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, border: `1px solid ${colors.border}`, borderRadius: 2 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Paperclip style={{ width: 14, height: 14, flexShrink: 0, color: colors.textSecondary }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.fileName}
                          </p>
                          <p style={{ fontSize: 10, color: colors.textSecondary }}>
                            {new Date(a.uploadedAt).toLocaleDateString('en-ZA')}
                            {a.notes && ` · ${a.notes}`}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 12 }}>
                        <button onClick={() => handleView(a.r2Key)} style={secBtn}>
                          <Eye style={{ width: 11, height: 11 }} /> View
                        </button>
                        {isMgr && (
                          <button onClick={() => handleDelete(a.id)} style={{ ...dangerBtn, padding: '0 6px' }}>
                            <X style={{ width: 11, height: 11 }} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '8px 12px', borderTop: '1px solid #B0B0B0', background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)', flexShrink: 0 }}>
          {isMgr && isPending && (
            <button onClick={handleApprove} disabled={approving} style={{ ...priBtn, opacity: approving ? 0.5 : 1 }}>
              {approving
                ? <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
                : <><CheckCircle style={{ width: 11, height: 11 }} /> Approve</>}
            </button>
          )}
          {isMgr && !isVoided && (
            <button onClick={handleVoid} disabled={voiding} style={{ ...dangerBtn, opacity: voiding ? 0.5 : 1 }}>
              {voiding
                ? <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
                : <><Trash2 style={{ width: 11, height: 11 }} /> Void</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
