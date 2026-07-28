'use client'

import { useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import {
  CheckCircle, Trash2, Paperclip, Eye, Loader2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { colors } from '@/lib/design-tokens'
import { Btn, PortalPage } from '@/components/rpx'
import { StatusBadge } from '@/components/ui/DataTable'
import { DocumentViewerModal } from '@/components/ui/DocumentViewerModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ExpenseDetail = {
  id: string; refNumber: string; description: string
  amount: string; vatAmount: string; includesVat: boolean
  paymentMethod: string; chequeNo?: string | null
  status: string; cashUpId?: string | null
  createdAt: string; approvedAt?: string | null; approvedById?: string | null
  expenseType: { name: string }
  attachments: Attachment[]
}

type Attachment = { id: string; fileName: string; r2Key: string; notes?: string | null; uploadedAt: string }

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const { confirm } = useConfirm()
  const isMgr = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: expense, mutate: mutateExpense, isLoading } =
    useSWR<ExpenseDetail>(`/api/expenses/${id}`, fetcher)

  const { data: attachments, mutate: mutateAttachments } =
    useSWR<ExpenseDetail['attachments']>(`/api/expenses/${id}/attachments`, fetcher)

  const [approving, setApproving] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [viewingAttachment, setViewingAttachment] = useState<{ attachment: Attachment; url: string } | null>(null)
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleApprove() {
    setApproving(true)
    const res = await fetch(`/api/expenses/${id}/approve`, { method: 'POST' })
    setApproving(false)
    if (res.ok) { toast.success('Expense approved'); mutateExpense() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to approve') }
  }

  async function handleVoid() {
    const confirmed = await confirm({
      title: 'Void Expense',
      message: 'Are you sure you want to void this expense? This action cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Void Expense',
      cancelLabel: 'Cancel',
    })
    if (!confirmed) return
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
      const fd = new FormData()
      fd.append('context', 'expense_attachment')
      fd.append('referenceId', id)
      fd.append('file', file)
      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) {
        const j = await uploadRes.json().catch(() => ({}))
        toast.error(j.error ?? 'Upload failed')
        return
      }
      const { key } = await uploadRes.json()

      const saveRes = await fetch(`/api/expenses/${id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2Key: key, fileName: file.name }),
      })
      if (saveRes.ok) { toast.success('Attachment uploaded'); mutateAttachments() }
      else { toast.error('Failed to save attachment') }
    } catch {
      toast.error('Upload failed — check your connection')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleView(attachment: Attachment) {
    setViewLoadingId(attachment.id)
    const res = await fetch(`/api/r2/view-url?key=${encodeURIComponent(attachment.r2Key)}`)
    setViewLoadingId(null)
    if (res.ok) { const { url } = await res.json(); setViewingAttachment({ attachment, url }) }
    else toast.error('Failed to get view URL')
  }

  async function handleDelete(attachId: string) {
    const confirmed = await confirm({
      title: 'Delete Attachment',
      message: 'Are you sure you want to delete this attachment?',
      variant: 'warning',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    })
    if (!confirmed) return
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
    <PortalPage
      title={expense.refNumber}
      actions={
        <>
          {isMgr && isPending && (
            <Btn variant="primary" size="sm" icon={CheckCircle} loading={approving} onClick={handleApprove}>Approve</Btn>
          )}
          {isMgr && !isVoided && (
            <Btn variant="danger" size="sm" icon={Trash2} loading={voiding} onClick={handleVoid}>Void</Btn>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {/* Sub-header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary, fontFamily: 'monospace' }}>{expense.refNumber}</span>
          <StatusBadge status={expense.status} />
          <span style={{ fontSize: 10, color: colors.textSecondary, padding: '2px 6px', background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2 }}>
            {expense.expenseType.name}
          </span>
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
                <Btn icon={Upload} loading={uploading} onClick={() => fileRef.current?.click()}>Upload Slip</Btn>
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
                        <Btn size="sm" icon={Eye} loading={viewLoadingId === a.id} onClick={() => handleView(a)}>View</Btn>
                        {isMgr && (
                          <Btn size="sm" variant="danger" icon={X} onClick={() => handleDelete(a.id)} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {viewingAttachment && (
        <DocumentViewerModal
          title="Attachment"
          subtitle={new Date(viewingAttachment.attachment.uploadedAt).toLocaleDateString('en-ZA')}
          url={viewingAttachment.url}
          fileName={viewingAttachment.attachment.fileName}
          onClose={() => setViewingAttachment(null)}
        />
      )}
    </PortalPage>
  )
}
