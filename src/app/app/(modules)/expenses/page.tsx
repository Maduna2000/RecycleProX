'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Decimal from 'decimal.js'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { CheckCircle, Trash2, Loader2, Receipt, Search, X, Plus, Paperclip, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateExpenseSchema, type CreateExpenseFormInput, type CreateExpenseInput } from '@/lib/schemas/expense'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
      label:  'Approve',
      icon:   CheckCircle,
      hidden: (r) => !isManager || r.status !== 'pending',
      onClick: (r) => handleApprove(r.id),
    },
    {
      label:  'Void',
      icon:   Trash2,
      danger: true,
      hidden: (r) => !isManager || r.status === 'voided',
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
            className="pl-7 pr-3 py-1 text-xs rounded border bg-white focus:outline-none w-60 border-rpx-border focus:border-rpx-blue"
          />
        </div>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border rounded px-2 py-1 text-xs bg-white focus:outline-none border-rpx-border focus:border-rpx-blue"
          style={{ color: from ? colors.textPrimary : colors.textSecondary }}
          title="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border rounded px-2 py-1 text-xs bg-white focus:outline-none border-rpx-border focus:border-rpx-blue"
          style={{ color: to ? colors.textPrimary : colors.textSecondary }}
          title="To date"
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs hover:text-[#212529] transition-colors"
            style={{ color: colors.textSecondary }}
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Approved total banner */}
      {tab === 'Approved' && data && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg shrink-0 mb-3"
          style={{ background: colors.actionBg, border: `1px solid ${colors.action}30` }}
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
          onRowClick={(r) => router.push(`/app/expenses/${r.id}`)}
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
        if (presignRes.ok) {
          const { uploadUrl, key } = await presignRes.json()
          const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: slipFile, headers: { 'Content-Type': slipFile.type } })
          if (uploadRes.ok) {
            await fetch(`/api/expenses/${created.id}/attachments`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ r2Key: key, fileName: slipFile.name }),
            })
          }
        }
      } catch {
        // Expense saved — slip upload failure is non-fatal
        toast.warning('Expense saved but slip upload failed')
      }
    }

    setLoading(false)
    toast.success('Expense recorded')
    onSuccess()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Expense Category</Label>
              <button
                type="button"
                onClick={() => setAddTypeOpen(true)}
                className="text-xs hover:underline"
                style={{ color: colors.action }}
              >
                + New category
              </button>
            </div>
            <Select
              value={expenseTypeId ?? ''}
              onValueChange={(v) => setValue('expenseTypeId', v as string)}
            >
              <SelectTrigger>
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
              <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.expenseTypeId.message}</p>
            )}
          </div>

          <div>
            <Label>Description</Label>
            <Input {...register('description')} className="mt-1" disabled={loading} placeholder="Brief description…" />
            {errors.description && (
              <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (R)</Label>
              <Input {...register('amount')} type="number" step="0.01" min="0.01" className="mt-1" disabled={loading} />
              {errors.amount && (
                <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.amount.message}</p>
              )}
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select onValueChange={(v) => setValue('paymentMethod', v as 'cash' | 'eft' | 'cheque' | 'amplopay')} defaultValue="cash">
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
              <Label>Cheque Number</Label>
              <Input {...register('chequeNo')} className="mt-1" disabled={loading} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textPrimary }}>
            <input
              type="checkbox"
              checked={!!includesVat}
              onChange={(e) => setValue('includesVat', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Amount includes 15% VAT
          </label>

          {/* Slip / receipt upload */}
          <div>
            <Label>Slip / Receipt (optional)</Label>
            <div className="mt-1">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
                disabled={loading}
              />
              {slipFile ? (
                <div
                  className="flex items-center justify-between px-3 py-2 rounded border text-xs"
                  style={{ borderColor: colors.border, color: colors.textPrimary }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Paperclip className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textSecondary }} />
                    <span className="truncate">{slipFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSlipFile(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="ml-2 shrink-0"
                    style={{ color: colors.textSecondary }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded border border-dashed text-xs w-full hover:bg-gray-50 transition-colors"
                  style={{ borderColor: colors.border, color: colors.textSecondary }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload slip or photo (PDF, JPG, PNG — max 20 MB)
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button
              type="submit"
              style={{ background: colors.action }}
              className="hover:opacity-90"
              disabled={loading}
            >
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Record Expense'}
            </Button>
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>New Expense Category</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>Category Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="e.g. Fuel, Wages, Repairs"
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button
              type="submit"
              style={{ background: colors.action }}
              className="hover:opacity-90"
              disabled={loading || !name.trim()}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
