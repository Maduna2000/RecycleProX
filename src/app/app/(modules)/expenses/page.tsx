'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Decimal from 'decimal.js'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { CheckCircle, Trash2, Receipt, Search, X, Plus, Paperclip, Upload, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateExpenseSchema, type CreateExpenseFormInput, type CreateExpenseInput } from '@/lib/schemas/expense'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog, DialogContent, ModalBtn } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ExpenseType = { id: string; name: string; parentId?: string | null }
type Expense = {
  id: string; refNumber: string; description: string
  amount: string; vatAmount: string; includesVat: boolean
  paymentMethod: string; chequeNo?: string | null; status: string
  createdAt: string; expenseType: { name: string }
  _count?: { attachments: number }
}

const PAGE_TABS = ['Pending', 'Approved', 'All'] as const
type PageTab = typeof PAGE_TABS[number]

export default function ExpensesPage() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [tab,         setTab]         = useState<PageTab>('Pending')
  const [addOpen,     setAddOpen]     = useState(false)
  const [addTypeOpen, setAddTypeOpen] = useState(false)
  const [search,      setSearch]      = useState('')
  const [from,        setFrom]        = useState('')
  const [to,          setTo]          = useState('')

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
    if (!confirm('Void this expense?')) return
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
    <PageShell
      title="Expenses"
      subtitle={`${data?.total ?? expenses.length} expenses`}
      action={
        <Button
          onClick={() => setAddOpen(true)}
          style={{ background: colors.action }}
          className="text-white hover:opacity-90 text-xs h-8 px-3"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Expense
        </Button>
      }
      tabs={pageTabs}
      activeTab={tab}
      onTabChange={(v) => setTab(v as PageTab)}
    >
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center shrink-0 mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, category or description..."
            className="pl-7 pr-3 h-7 text-xs rounded border bg-white focus:outline-none w-60 border-[#E0E0E0] focus:border-[#185ABD]"
          />
        </div>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: from ? colors.textPrimary : colors.textSecondary }}
          title="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: to ? colors.textPrimary : colors.textSecondary }}
          title="To date"
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="h-7 px-2.5 text-xs flex items-center gap-1 border rounded hover:bg-[#F1F3F4] transition-colors"
            style={{ borderColor: colors.border, color: colors.textSecondary }}
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Approved total banner */}
      {tab === 'Approved' && data && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 shrink-0 mb-3"
          style={{ background: colors.actionBg, border: `1px solid ${colors.action}30`, borderRadius: 2 }}
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
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={expenses}
          rowKey={(r) => r.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No expenses found"
          total={data?.total}
          pageSize={50}
        />
      </div>

      {addOpen && (
        <AddExpenseModal
          onClose={() => setAddOpen(false)}
          onSuccess={() => { mutate(key); setAddOpen(false) }}
        />
      )}

      {addTypeOpen && (
        <AddTypeModal
          onClose={() => setAddTypeOpen(false)}
          onSuccess={() => { mutate('/api/expense-types'); setAddTypeOpen(false) }}
        />
      )}
    </PageShell>
  )
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────
function AddExpenseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading,     setLoading]     = useState(false)
  const [addTypeOpen, setAddTypeOpen] = useState(false)
  const [slipFile,    setSlipFile]    = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: types } = useSWR<ExpenseType[]>('/api/expense-types', fetcher)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateExpenseFormInput, unknown, CreateExpenseInput>({
    resolver: zodResolver(CreateExpenseSchema),
    defaultValues: { paymentMethod: 'cash', includesVat: false },
  })

  const paymentMethod  = watch('paymentMethod')
  const includesVat    = watch('includesVat')
  const expenseTypeId  = watch('expenseTypeId') as string | undefined
  const selectedTypeName = (types ?? []).find((t) => t.id === expenseTypeId)?.name

  async function onSubmit(data: CreateExpenseInput) {
    setLoading(true)
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
      <DialogContent
        className="sm:max-w-lg p-0"
        showCloseButton={false}
        style={{
          borderRadius: 2,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: colors.surface,
        }}
      >
        {/* Windows-style title bar with gradient */}
        <div
          style={{
            background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)',
            borderBottom: `1px solid ${colors.border}`,
            padding: '6px 8px 6px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary }}>Add Expense</span>
          <button
            onClick={onClose}
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 2,
              color: colors.textSecondary,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textSecondary }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

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
                <Select onValueChange={(v) => setValue('paymentMethod', v as 'cash' | 'eft' | 'cheque' | 'amplopay')} defaultValue="cash">
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
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="amplopay">AmploPay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {paymentMethod === 'cheque' && (
              <div>
                <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cheque Number</Label>
                <Input
                  {...register('chequeNo')}
                  disabled={loading}
                  style={{
                    height: 28,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2,
                    padding: '2px 8px',
                    fontSize: fontSize.base,
                  }}
                />
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fontSize.base, cursor: 'pointer', color: colors.textPrimary }}>
              <input
                type="checkbox"
                checked={!!includesVat}
                onChange={(e) => setValue('includesVat', e.target.checked)}
                style={{ width: 14, height: 14, accentColor: colors.action }}
              />
              Amount includes 15% VAT
            </label>

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

            {/* Footer with gradient */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 8,
                paddingTop: 12,
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <ModalBtn onClick={onClose} disabled={loading}>Cancel</ModalBtn>
              <ModalBtn type="submit" variant="primary" loading={loading}>Record Expense</ModalBtn>
            </div>
          </div>
        </form>
      </DialogContent>

      {addTypeOpen && (
        <AddTypeModal
          onClose={() => setAddTypeOpen(false)}
          onSuccess={() => { mutate('/api/expense-types'); setAddTypeOpen(false) }}
        />
      )}
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
      <DialogContent
        className="sm:max-w-sm p-0"
        showCloseButton={false}
        style={{
          borderRadius: 2,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: colors.surface,
        }}
      >
        {/* Windows-style title bar with gradient */}
        <div
          style={{
            background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)',
            borderBottom: `1px solid ${colors.border}`,
            padding: '6px 8px 6px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary }}>New Expense Category</span>
          <button
            onClick={onClose}
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 2,
              color: colors.textSecondary,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textSecondary }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label style={{ display: 'block', marginBottom: 4, fontSize: fontSize.sm, fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category Name</Label>
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
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 4,
                paddingTop: 12,
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <ModalBtn onClick={onClose} disabled={loading}>Cancel</ModalBtn>
              <ModalBtn type="submit" variant="primary" loading={loading} disabled={loading || !name.trim()}>Create</ModalBtn>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
