'use client'

import { useState } from 'react'
import Decimal from 'decimal.js'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateExpenseSchema, type CreateExpenseFormInput, type CreateExpenseInput } from '@/lib/schemas/expense'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Plus, CheckCircle, Trash2, Loader2, Receipt } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ExpenseType = { id: string; name: string; parentId?: string | null }
type Expense = {
  id: string; refNumber: string; description: string
  amount: string; vatAmount: string; includesVat: boolean
  paymentMethod: string; chequeNo?: string; status: string
  createdAt: string; expenseType: { name: string }
}

const TABS = ['Pending', 'Approved', 'All'] as const

export default function ExpensesPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const [tab, setTab] = useState<typeof TABS[number]>('Pending')
  const [addOpen, setAddOpen] = useState(false)

  const statusMap: Record<typeof TABS[number], string | undefined> = {
    Pending: 'pending',
    Approved: 'approved',
    All: undefined,
  }
  const status = statusMap[tab]
  const key = `/api/expenses?${status ? `status=${status}&` : ''}limit=50`
  const { data, isLoading } = useSWR<{ expenses: Expense[]; total: number }>(key, fetcher)

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

  const totalApproved = (data?.expenses ?? [])
    .filter((e) => e.status === 'approved')
    .reduce((acc, e) => acc.plus(new Decimal(e.amount)), new Decimal(0))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and manage business expenses</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-green-600 hover:bg-green-700">
          <Plus className="w-4 h-4 mr-2" /> Add Expense
        </Button>
      </div>

      {/* Summary card */}
      {tab === 'Approved' && data && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-4">
          <Receipt className="w-6 h-6 text-green-600" />
          <div>
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Total Approved Expenses (current view)</p>
            <p className="text-2xl font-bold text-green-800">R {totalApproved.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : !data?.expenses?.length ? (
          <div className="text-center p-10 text-gray-400">No expenses found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ref #', 'Category', 'Description', 'Amount', 'VAT', 'Method', 'Status', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.refNumber}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{e.expenseType.name}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{e.description}</td>
                  <td className="px-4 py-3 font-semibold">R {parseFloat(e.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {e.includesVat ? `R ${parseFloat(e.vatAmount).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 capitalize">{e.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleDateString('en-ZA')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {isManager && e.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => handleApprove(e.id)}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                      )}
                      {isManager && e.status !== 'voided' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => handleVoid(e.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <AddExpenseModal
          onClose={() => setAddOpen(false)}
          onSuccess={() => { mutate(key); setAddOpen(false) }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    voided:   'bg-red-100 text-red-700',
  }
  return (
    <Badge className={map[status] ?? 'bg-gray-100 text-gray-600'}>
      {status}
    </Badge>
  )
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────
function AddExpenseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [addTypeOpen, setAddTypeOpen] = useState(false)
  const { data: types } = useSWR<ExpenseType[]>('/api/expense-types', fetcher)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateExpenseFormInput, unknown, CreateExpenseInput>({
    resolver: zodResolver(CreateExpenseSchema),
    defaultValues: {
      paymentMethod: 'cash',
      includesVat:   false,
    },
  })

  const paymentMethod = watch('paymentMethod')
  const includesVat   = watch('includesVat')

  async function onSubmit(data: CreateExpenseInput) {
    setLoading(true)
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) { toast.success('Expense recorded'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to record expense') }
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
                className="text-xs text-green-600 hover:underline"
              >
                + New category
              </button>
            </div>
            <Select onValueChange={(v) => setValue('expenseTypeId', v as string)}>
              <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.expenseTypeId && <p className="text-xs text-red-600 mt-1">{errors.expenseTypeId.message}</p>}
          </div>

          <div>
            <Label>Description</Label>
            <Input {...register('description')} className="mt-1" disabled={loading} placeholder="Brief description..." />
            {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (R)</Label>
              <Input {...register('amount')} type="number" step="0.01" min="0.01" className="mt-1" disabled={loading} />
              {errors.amount && <p className="text-xs text-red-600 mt-1">{errors.amount.message}</p>}
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select
                onValueChange={(v) => setValue('paymentMethod', v as 'cash' | 'eft' | 'cheque' | 'amplopay')}
                defaultValue="cash"
              >
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

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!includesVat}
              onChange={(e) => setValue('includesVat', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600"
            />
            Amount includes 15% VAT
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Record Expense'}
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

// ─── Quick-add Category Modal ────────────────────────────────────────────────
function AddTypeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const res = await fetch('/api/expense-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
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
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Fuel, Wages, Repairs" disabled={loading} autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading || !name.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
