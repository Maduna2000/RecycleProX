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
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/DataTable'
import { colors, fontSize } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ExpenseDetail = {
  id: string; refNumber: string; description: string
  amount: string; vatAmount: string; includesVat: boolean
  paymentMethod: string; chequeNo?: string | null
  status: string; cashUpId?: string | null
  createdAt: string; approvedAt?: string | null; approvedById?: string | null
  expenseType: { name: string }
  attachments: { id: string; fileName: string; r2Key: string; notes?: string | null; uploadedAt: string }[]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: colors.textSecondary }}>
        {label}
      </p>
      <div style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{children}</div>
    </div>
  )
}

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { data: session } = useSession()
  const isMgr   = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: expense, mutate: mutateExpense, isLoading } =
    useSWR<ExpenseDetail>(`/api/expenses/${id}`, fetcher)

  const { data: attachments, mutate: mutateAttachments } =
    useSWR<ExpenseDetail['attachments']>(`/api/expenses/${id}/attachments`, fetcher)

  const [approving, setApproving] = useState(false)
  const [voiding,   setVoiding]   = useState(false)
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ context: 'expense_attachment', referenceId: id, contentType: file.type, fileSize: file.size }),
      })
      if (!presignRes.ok) { toast.error('Failed to get upload URL'); return }
      const { uploadUrl, key } = await presignRes.json()

      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!uploadRes.ok) { toast.error('Upload failed'); return }

      const saveRes = await fetch(`/api/expenses/${id}/attachments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ r2Key: key, fileName: file.name }),
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
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.textSecondary }} />
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="max-w-2xl mx-auto pt-12 text-center">
        <p style={{ color: colors.textSecondary }}>Expense not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/app/expenses')}>
          Back to Expenses
        </Button>
      </div>
    )
  }

  const isPending  = expense.status === 'pending'
  const isVoided   = expense.status === 'voided'
  const attachList = attachments ?? expense.attachments ?? []

  return (
    <div className="max-w-2xl mx-auto pb-12">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" type="button" onClick={() => router.push('/app/expenses')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Expenses
          </Button>
          <span style={{ color: colors.border }}>/</span>
          <span className="font-mono text-sm font-semibold" style={{ color: colors.textPrimary }}>
            {expense.refNumber}
          </span>
          <StatusBadge status={expense.status} />
        </div>
        {isMgr && (
          <div className="flex items-center gap-2">
            {isPending && (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-1.5" />Approve</>}
              </Button>
            )}
            {!isVoided && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleVoid}
                disabled={voiding}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                {voiding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4 mr-1.5" />Void</>}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Expense Details */}
      <div className="bg-white rounded-xl border overflow-hidden mb-4">
        <div className="px-5 py-3 border-b" style={{ background: colors.surface }}>
          <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Expense Details</span>
        </div>
        <div className="p-5 grid grid-cols-2 gap-5">
          <Field label="Ref Number">
            <span className="font-mono">{expense.refNumber}</span>
          </Field>
          <Field label="Category">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium inline-block"
              style={{ background: colors.processBg, color: colors.process }}
            >
              {expense.expenseType.name}
            </span>
          </Field>
          <div className="col-span-2">
            <Field label="Description">{expense.description}</Field>
          </div>
          <Field label="Amount">
            <span className="font-mono font-semibold">R {new Decimal(expense.amount).toFixed(2)}</span>
          </Field>
          <Field label="VAT Amount">
            <span className="font-mono">
              {expense.includesVat ? `R ${new Decimal(expense.vatAmount).toFixed(2)}` : '—'}
            </span>
          </Field>
          <Field label="Payment Method">
            <span className="capitalize">{expense.paymentMethod}</span>
          </Field>
          {expense.chequeNo && (
            <Field label="Cheque No">
              <span className="font-mono">{expense.chequeNo}</span>
            </Field>
          )}
          <Field label="Cash-Up Session">
            {expense.cashUpId
              ? <span className="font-mono text-xs">{expense.cashUpId}</span>
              : <span style={{ color: colors.textSecondary }}>—</span>}
          </Field>
          <Field label="Created">
            {new Date(expense.createdAt).toLocaleString('en-ZA')}
          </Field>
          {expense.approvedAt && (
            <Field label="Approved At">
              {new Date(expense.approvedAt).toLocaleString('en-ZA')}
            </Field>
          )}
        </div>
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background: colors.surface }}>
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>
              Attachments {attachList.length > 0 && `(${attachList.length})`}
            </span>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs"
            >
              {uploading
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</>
                : <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload Slip</>}
            </Button>
          </div>
        </div>

        <div className="p-5">
          {attachList.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: colors.textSecondary }}>
              No attachments yet — upload a receipt or slip above.
            </p>
          ) : (
            <div className="space-y-2">
              {attachList.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ borderColor: colors.border }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="w-4 h-4 shrink-0" style={{ color: colors.textSecondary }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>
                        {a.fileName}
                      </p>
                      <p className="text-xs" style={{ color: colors.textSecondary }}>
                        {new Date(a.uploadedAt).toLocaleDateString('en-ZA')}
                        {a.notes && ` · ${a.notes}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => handleView(a.r2Key)}>
                      <Eye className="w-3.5 h-3.5 mr-1" />View
                    </Button>
                    {isMgr && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2 text-red-500 hover:bg-red-50"
                        onClick={() => handleDelete(a.id)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
