'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Decimal from 'decimal.js'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { CheckCircle, Trash2, Receipt, Search, X, Paperclip, Upload, Eye, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateExpenseSchema, type CreateExpenseFormInput, type CreateExpenseInput } from '@/lib/schemas/expense'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { colors, fontSize } from '@/lib/design-tokens'
import {
  inp, Btn, Field, PortalPage, FilterBar,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ExpenseType = { id: string; name: string; parentId?: string | null }
type Expense = {
  id: string; refNumber: string; description: string
  amount: string; vatAmount: string; includesVat: boolean
  estimatedAmount?: string | null; changeReceived?: string | null
  paymentMethod: string; chequeNo?: string | null; status: string
  createdAt: string; updatedAt: string; createdByUserId?: string | null
  expenseType: { id: string; name: string }
  _count?: { attachments: number }
}

const PAGE_TABS = ['Pending', 'Approved', 'All'] as const
type PageTab = typeof PAGE_TABS[number]

export default function ExpensesPage() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const { data: session } = useSession()
  const { confirm }   = useConfirm()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [tab,              setTab]              = useState<PageTab>('Pending')
  const [addOpen,          setAddOpen]          = useState(false)
  const [addTypeOpen,      setAddTypeOpen]      = useState(false)
  const [settlingExpense,  setSettlingExpense]  = useState<Expense | null>(null)
  const [search,         setSearch]         = useState('')
  const [from,           setFrom]           = useState('')
  const [to,             setTo]             = useState('')

  // Open modal from toolbar query params
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setAddOpen(true)
      router.replace('/app/expenses')
    }
    if (searchParams.get('addtype') === '1') {
      setAddTypeOpen(true)
      router.replace('/app/expenses')
    }
  }, [searchParams, router])

  const hasFilters = !!(search || from || to)
  function clearFilters() { setSearch(''); setFrom(''); setTo('') }

  const statusMap: Record<PageTab, string | undefined> = {
    Pending:  'pending',
    Approved: 'approved',
    All:      undefined,
  }
  const statusFilter = statusMap[tab]
  const query = new URLSearchParams({
    ...(statusFilter && { status: statusFilter }),
    ...(search       && { search }),
    ...(from         && { from }),
    ...(to           && { to }),
    limit: '50',
  })
  const key = `/api/expenses?${query}`
  const { data, isLoading } = useSWR<{ expenses: Expense[]; total: number }>(key, fetcher)
  const expenses = data?.expenses ?? []

  const totalApproved = expenses
    .filter((e) => e.status === 'approved')
    .reduce((acc, e) => acc.plus(new Decimal(e.amount)), new Decimal(0))

  async function handleApprove(id: string) {
    const res = await fetch(`/api/expenses/${id}/approve`, { method: 'POST' })
    if (res.ok) { toast.success('Expense approved'); mutate(key) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to approve') }
  }

  async function handleVoid(id: string) {
    const confirmed = await confirm({
      title: 'Void Expense',
      message: 'Are you sure you want to void this expense? This action cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Void Expense',
      cancelLabel: 'Cancel',
    })
    if (!confirmed) return
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Expense voided'); mutate(key) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void') }
  }

  const columns: Column<Expense>[] = [
    {
      key: 'attachments',
      header: '',
      width: '28px',
      render: (r) => (r._count?.attachments ?? 0) > 0
        ? <Paperclip className="w-3 h-3" style={{ color: colors.textSecondary }} />
        : null,
    },
    {
      key: 'refNumber',
      header: 'Ref #',
      width: '130px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>{r.refNumber}</span>
      ),
    },
    {
      key: 'expenseType',
      header: 'Category',
      width: '140px',
      render: (r) => (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: colors.processBg, color: colors.process }}
        >
          {r.expenseType.name}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => (
        <span
          className="truncate block max-w-[200px]"
          style={{ fontSize: fontSize.sm, color: colors.textPrimary }}
        >
          {r.description}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '100px',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-semibold" style={{ color: colors.textPrimary }}>
          R {new Decimal(r.amount).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'vatAmount',
      header: 'VAT',
      width: '90px',
      align: 'right',
      render: (r) => (
        <span className="font-mono" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
          {r.includesVat ? `R ${new Decimal(r.vatAmount).toFixed(2)}` : '—'}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      width: '90px',
      render: (r) => (
        <span className="capitalize" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
          {r.paymentMethod}
        </span>
      ),
    },
    {
      key: 'chequeNo',
      header: 'Cheque No',
      width: '100px',
      render: (r) => (
        <span className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {r.chequeNo ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '90px',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '100px',
      render: (r) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {new Date(r.createdAt).toLocaleDateString('en-ZA')}
        </span>
      ),
    },
  ]

  const rowActions: RowAction<Expense>[] = [
    {
      label:   'View Details',
      icon:    Eye,
      hidden:  () => false,
      onClick: (r) => router.push(`/app/expenses/${r.id}`),
    },
    {
      label:   'Update',
      icon:    Pencil,
      hidden:  (r) => {
        if (r.status !== 'pending') return true
        const isCreator = r.createdByUserId === session?.user?.id
        return !isCreator && !isManager
      },
      onClick: (r) => setSettlingExpense(r),
    },
    {
      label:   'View Slip',
      icon:    Paperclip,
      hidden:  (r) => (r._count?.attachments ?? 0) === 0,
      onClick: (r) => router.push(`/app/expenses/${r.id}`),
    },
    {
      label:   'Approve',
      icon:    CheckCircle,
      hidden:  (r) => !isManager || r.status !== 'pending',
      onClick: (r) => handleApprove(r.id),
    },
    {
      label:   'Void',
      icon:    Trash2,
      danger:  true,
      hidden:  (r) => !isManager || r.status === 'voided',
      onClick: (r) => handleVoid(r.id),
    },
  ]

  const pageTabs = PAGE_TABS.map((t) => ({ value: t, label: t }))

  return (
    <PortalPage
      tabs={pageTabs}
      active={tab}
      onChange={(v) => setTab(v as PageTab)}
    >
      <FilterBar>
        <Field label="Search" width={220}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: colors.textSecondary }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref, category or description..."
              style={{ ...inp, paddingLeft: 24 }}
            />
          </div>
        </Field>
        <Field label="From" width={145}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} title="From date" />
        </Field>
        <Field label="To" width={145}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} title="To date" />
        </Field>
        {hasFilters && (
          <Btn size="sm" icon={X} onClick={clearFilters}>Clear</Btn>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6C757D', paddingBottom: 8 }}>
          {data?.total ?? expenses.length} expenses
        </span>
      </FilterBar>

      {/* Approved total banner */}
      {tab === 'Approved' && data && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 shrink-0"
          style={{ margin: '10px 10px 0', background: colors.actionBg, border: `1px solid ${colors.action}30`, borderRadius: 2 }}
        >
          <Receipt className="w-4 h-4 shrink-0" style={{ color: colors.action }} />
          <div>
            <p className="text-xs font-semibold" style={{ color: colors.action }}>
              Total Approved Expenses (current view)
            </p>
            <p className="font-mono font-bold" style={{ fontSize: fontSize.lg, color: '#1a5c38' }}>
              R {totalApproved.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={expenses}
          rowKey={(r) => r.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No expenses found"
          emptyIcon={Receipt}
          emptyAction={{
            label: "Add your first expense",
            onClick: () => setAddOpen(true),
          }}
          total={data?.total}
          pageSize={50}
        />
      </div>

      {addOpen && (
        <AddExpenseModal
          mode="create"
          onClose={() => setAddOpen(false)}
          onSuccess={() => { mutate(key); setAddOpen(false) }}
        />
      )}

      {settlingExpense && (
        <UpdatePendingExpenseModal
          expense={settlingExpense}
          onClose={() => setSettlingExpense(null)}
          onSuccess={() => { mutate(key); setSettlingExpense(null) }}
        />
      )}

      {addTypeOpen && (
        <AddTypeModal
          onClose={() => setAddTypeOpen(false)}
          onSuccess={() => { mutate('/api/expense-types'); setAddTypeOpen(false) }}
        />
      )}
    </PortalPage>
  )
}

// ─── Add/Edit Expense Modal ──────────────────────────────────────────────────
type AddExpenseModalProps = {
  mode: 'create' | 'edit'
  expense?: Expense
  onClose: () => void
  onSuccess: () => void
}

function AddExpenseModal({ mode, expense, onClose, onSuccess }: AddExpenseModalProps) {
  const [loading,     setLoading]     = useState(false)
  const [addTypeOpen, setAddTypeOpen] = useState(false)
  const [slipFile,    setSlipFile]    = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: types } = useSWR<ExpenseType[]>('/api/expense-types', fetcher)

  const isEdit = mode === 'edit' && expense

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateExpenseFormInput, unknown, CreateExpenseInput>({
    resolver: zodResolver(CreateExpenseSchema),
    defaultValues: isEdit
      ? {
          expenseTypeId: expense.expenseType.id,
          description:   expense.description,
          amount:        parseFloat(expense.amount),
          includesVat:   expense.includesVat,
          paymentMethod: expense.paymentMethod as 'cash' | 'eft',
          isPending:     true, // Already pending in edit mode
        }
      : { paymentMethod: 'cash', includesVat: false, isPending: false },
  })

  const includesVat    = watch('includesVat')
  const isPending      = watch('isPending')
  const expenseTypeId  = watch('expenseTypeId') as string | undefined
  const selectedTypeName = (types ?? []).find((t) => t.id === expenseTypeId)?.name

  async function onSubmit(data: CreateExpenseInput) {
    setLoading(true)

    if (isEdit) {
      // Edit mode - PATCH request
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          expenseTypeId: data.expenseTypeId,
          description:   data.description,
          amount:        data.amount,
          includesVat:   data.includesVat,
          paymentMethod: data.paymentMethod,
          updatedAt:     expense.updatedAt,
        }),
      })
      if (!res.ok) {
        setLoading(false)
        const j = await res.json()
        toast.error(j.error ?? 'Failed to update expense')
        return
      }
      setLoading(false)
      toast.success('Expense updated')
      onSuccess()
      return
    }

    // Create mode - POST request
    const res = await fetch('/api/expenses', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (!res.ok) {
      setLoading(false)
      const j = await res.json()
      toast.error(j.error ?? 'Failed to record expense')
      return
    }
    const created = await res.json()

    // Upload slip attachment if one was selected
    if (slipFile && created?.id) {
      try {
        const presignRes = await fetch('/api/r2/upload-url', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ context: 'expense_attachment', referenceId: created.id, contentType: slipFile.type, fileSize: slipFile.size }),
        })
        if (!presignRes.ok) {
          toast.warning('Expense saved — slip upload failed. Add it from expense details.')
        } else {
          const { uploadUrl, key } = await presignRes.json()
          const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: slipFile, headers: { 'Content-Type': slipFile.type } })
          if (!uploadRes.ok) {
            toast.warning('Expense saved — slip upload failed. Add it from expense details.')
          } else {
            await fetch(`/api/expenses/${created.id}/attachments`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ r2Key: key, fileName: slipFile.name }),
            })
          }
        }
      } catch {
        toast.warning('Expense saved — slip upload failed. Add it from expense details.')
      }
    }

    setLoading(false)
    toast.success('Expense recorded')
    onSuccess()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={520}>
        <RpxDialogHeader title={isEdit ? 'Edit Expense' : 'Add Expense'} onClose={onClose} />
        <form id="expense-form" onSubmit={handleSubmit(onSubmit)}>
          <RpxDialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Label style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Expense Category</Label>
                <button
                  type="button"
                  onClick={() => setAddTypeOpen(true)}
                  style={{ fontSize: 11, fontWeight: 600, color: colors.action, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  + New category
                </button>
              </div>
              <Select
                value={expenseTypeId ?? ''}
                onValueChange={(v) => setValue('expenseTypeId', v as string)}
              >
                <SelectTrigger
                  style={{
                    width: '100%',
                    height: 28,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2,
                    background: colors.surface,
                    padding: '2px 8px',
                    fontSize: fontSize.base,
                    color: expenseTypeId ? colors.textPrimary : colors.textMuted,
                  }}
                >
                  <SelectValue placeholder="Select category…">
                    {selectedTypeName ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(types ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.expenseTypeId && (
                <p style={{ fontSize: 11, marginTop: 3, color: colors.danger }}>{errors.expenseTypeId.message}</p>
              )}
            </div>

            <div>
              <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</Label>
              <Input
                {...register('description')}
                disabled={loading}
                placeholder="Brief description…"
                style={{
                  height: 28,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 2,
                  padding: '2px 8px',
                  fontSize: fontSize.base,
                }}
              />
              {errors.description && (
                <p style={{ fontSize: 11, marginTop: 3, color: colors.danger }}>{errors.description.message}</p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount (R)</Label>
                <Input
                  {...register('amount')}
                  type="number"
                  step="0.01"
                  min="0.01"
                  disabled={loading}
                  style={{
                    height: 28,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2,
                    padding: '2px 8px',
                    fontSize: fontSize.base,
                  }}
                />
                {errors.amount && (
                  <p style={{ fontSize: 11, marginTop: 3, color: colors.danger }}>{errors.amount.message}</p>
                )}
              </div>
              <div>
                <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment Method</Label>
                <Select onValueChange={(v) => setValue('paymentMethod', v as 'cash' | 'eft')} defaultValue="cash">
                  <SelectTrigger
                    style={{
                      width: '100%',
                      height: 28,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 2,
                      background: colors.surface,
                      padding: '2px 8px',
                      fontSize: fontSize.base,
                      color: colors.textPrimary,
                    }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="eft">EFT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fontSize.base, cursor: 'pointer', color: colors.textPrimary }}>
              <input
                type="checkbox"
                checked={!!includesVat}
                onChange={(e) => setValue('includesVat', e.target.checked)}
                style={{ width: 14, height: 14, accentColor: colors.action }}
              />
              Amount includes 15% VAT
            </label>

            {!isEdit && (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fontSize.base, cursor: 'pointer', color: colors.textPrimary }}>
                  <input
                    type="checkbox"
                    checked={!!isPending}
                    onChange={(e) => setValue('isPending', e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: colors.action }}
                  />
                  Mark as pending expense
                </label>
                <p style={{ fontSize: 11, marginTop: 3, marginLeft: 20, color: colors.textMuted }}>
                  Pending expenses can be edited before approval
                </p>
              </div>
            )}

            <div>
              <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Slip / Receipt <span style={{ fontWeight: 400, color: colors.textMuted, textTransform: 'none' }}>(optional)</span></Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
                disabled={loading}
              />
              {slipFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 2, fontSize: fontSize.base, color: colors.textPrimary, background: colors.surface }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Paperclip style={{ width: 13, height: 13, flexShrink: 0, color: colors.textSecondary }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slipFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSlipFile(null); if (fileRef.current) fileRef.current.value = '' }}
                    style={{ marginLeft: 8, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, display: 'flex' }}
                  >
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: `1px dashed ${colors.border}`, borderRadius: 2, fontSize: fontSize.base, width: '100%', background: colors.bg, color: colors.textSecondary, cursor: 'pointer' }}
                >
                  <Upload style={{ width: 13, height: 13 }} />
                  Upload slip or photo (PDF, JPG, PNG — max 20 MB)
                </button>
              )}
            </div>
          </div>
          </RpxDialogBody>
        </form>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn type="submit" form="expense-form" variant="primary" loading={loading}>{isEdit ? 'Update Expense' : 'Record Expense'}</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>

      {addTypeOpen && (
        <AddTypeModal
          onClose={() => setAddTypeOpen(false)}
          onSuccess={() => { mutate('/api/expense-types'); setAddTypeOpen(false) }}
        />
      )}
    </Dialog>
  )
}

// ─── Update Pending Expense Modal (Settle with Change) ────────────────────────
type UpdatePendingExpenseModalProps = {
  expense: Expense
  onClose: () => void
  onSuccess: () => void
}

function UpdatePendingExpenseModal({ expense, onClose, onSuccess }: UpdatePendingExpenseModalProps) {
  const [loading, setLoading] = useState(false)
  const [changeReceived, setChangeReceived] = useState('')
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const estimatedAmount = new Decimal(expense.estimatedAmount ?? expense.amount)
  const changeDecimal = changeReceived ? new Decimal(changeReceived || '0') : new Decimal(0)
  const actualAmount = estimatedAmount.minus(changeDecimal)
  const isValidChange = changeDecimal.gte(0) && changeDecimal.lte(estimatedAmount) && actualAmount.gt(0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidChange) return

    setLoading(true)

    // Upload slip first if provided
    if (slipFile) {
      try {
        const presignRes = await fetch('/api/r2/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: 'expense_attachment',
            referenceId: expense.id,
            contentType: slipFile.type,
            fileSize: slipFile.size,
          }),
        })
        if (presignRes.ok) {
          const { uploadUrl, key } = await presignRes.json()
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: slipFile,
            headers: { 'Content-Type': slipFile.type },
          })
          if (uploadRes.ok) {
            await fetch(`/api/expenses/${expense.id}/attachments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ r2Key: key, fileName: slipFile.name }),
            })
          }
        }
      } catch {
        toast.warning('Slip upload failed. You can add it from expense details.')
      }
    }

    // Settle the expense
    const res = await fetch(`/api/expenses/${expense.id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeReceived: parseFloat(changeReceived || '0'),
        updatedAt: expense.updatedAt,
      }),
    })

    setLoading(false)
    if (res.ok) {
      toast.success('Expense updated and approved')
      onSuccess()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to update expense')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={480}>
        <RpxDialogHeader title="Update Pending Expense" onClose={onClose} />
        <form id="settle-expense-form" onSubmit={handleSubmit}>
          <RpxDialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Read-only expense info */}
            <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                Expense Info
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
                <span style={{ color: colors.textSecondary }}>Ref:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: colors.textPrimary }}>{expense.refNumber}</span>
                <span style={{ color: colors.textSecondary }}>Category:</span>
                <span style={{ color: colors.textPrimary }}>{expense.expenseType.name}</span>
                <span style={{ color: colors.textSecondary }}>Description:</span>
                <span style={{ color: colors.textPrimary }}>{expense.description}</span>
                <span style={{ color: colors.textSecondary }}>Estimated:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: colors.warning }}>
                  R {estimatedAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Change received input */}
            <div>
              <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Change Received (R)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={estimatedAmount.toNumber()}
                value={changeReceived}
                onChange={(e) => setChangeReceived(e.target.value)}
                disabled={loading}
                placeholder="0.00"
                style={{
                  height: 32,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 2,
                  padding: '2px 8px',
                  fontSize: 14,
                  fontFamily: 'monospace',
                }}
              />
              <p style={{ fontSize: 11, marginTop: 3, color: colors.textMuted }}>
                Enter the amount of change you received back
              </p>
            </div>

            {/* Calculated actual amount */}
            <div style={{ background: isValidChange ? colors.actionBg : colors.dangerBg, border: `1px solid ${isValidChange ? colors.action : colors.danger}`, borderRadius: 2, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isValidChange ? colors.action : colors.danger }}>
                  Actual Expense:
                </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: isValidChange ? colors.action : colors.danger }}>
                  R {isValidChange ? actualAmount.toFixed(2) : '—'}
                </span>
              </div>
              {!isValidChange && changeReceived && (
                <p style={{ fontSize: 11, marginTop: 4, color: colors.danger }}>
                  Change cannot exceed estimated amount. Actual amount must be greater than zero.
                </p>
              )}
            </div>

            {/* Slip upload */}
            <div>
              <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Receipt / Slip <span style={{ fontWeight: 400, color: colors.textMuted, textTransform: 'none' }}>(recommended)</span>
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
                disabled={loading}
              />
              {slipFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 2, fontSize: fontSize.base, color: colors.textPrimary, background: colors.surface }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Paperclip style={{ width: 13, height: 13, flexShrink: 0, color: colors.textSecondary }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slipFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSlipFile(null); if (fileRef.current) fileRef.current.value = '' }}
                    style={{ marginLeft: 8, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, display: 'flex' }}
                  >
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: `1px dashed ${colors.border}`, borderRadius: 2, fontSize: fontSize.base, width: '100%', background: colors.bg, color: colors.textSecondary, cursor: 'pointer' }}
                >
                  <Upload style={{ width: 13, height: 13 }} />
                  Upload receipt (PDF, JPG, PNG)
                </button>
              )}
            </div>
          </div>
          </RpxDialogBody>
        </form>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn
            type="submit"
            form="settle-expense-form"
            variant="primary"
            loading={loading}
            disabled={!isValidChange || loading}
          >
            Update & Approve
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Quick-add Category Modal ─────────────────────────────────────────────────
function AddTypeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [name,    setName]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const res = await fetch('/api/expense-types', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim() }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Category created'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={380}>
        <RpxDialogHeader title="New Expense Category" onClose={onClose} />
        <form id="add-type-form" onSubmit={handleSubmit}>
          <RpxDialogBody>
            <Field label="Category Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fuel, Wages, Repairs"
                disabled={loading}
                autoFocus
                style={{
                  height: 28,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 2,
                  padding: '2px 8px',
                  fontSize: fontSize.base,
                }}
              />
            </Field>
          </RpxDialogBody>
        </form>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn type="submit" form="add-type-form" variant="primary" loading={loading} disabled={loading || !name.trim()}>Create</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
