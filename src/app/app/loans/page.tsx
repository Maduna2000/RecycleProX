'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Search, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { format } from '@/lib/utils/format'
import { CustomerLookupWidget } from '@/components/CustomerLookupWidget'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = { id: string; firstName: string; lastName: string; idNumber: string }

type Repayment = {
  id: string; refNumber: string; amount: string
  paymentMethod: string; notes?: string; createdAt: string
}

type Loan = {
  id: string; refNumber: string; principalAmount: string; balanceAmount: string
  paymentMethod: string; notes?: string; status: 'active' | 'settled' | 'voided'
  voidedAt?: string; voidReason?: string; createdAt: string
  customer: Customer; _count?: { repayments: number }; repayments?: Repayment[]
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; customerType: string; blacklisted: boolean; priceGroupId?: string | null
}

const PAYMENT_METHODS = [
  { value: 'cash',     label: 'Cash' },
  { value: 'eft',      label: 'EFT' },
  { value: 'cheque',   label: 'Cheque' },
  { value: 'amplopay', label: 'AmploPay' },
]

type PageTab = 'active' | 'history'

export default function LoansPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [activeTab,    setActiveTab]    = useState<PageTab>('active')
  const [activeSearch, setActiveSearch] = useState('')
  const [histSearch,   setHistSearch]   = useState('')
  const [histFrom,     setHistFrom]     = useState('')
  const [histTo,       setHistTo]       = useState('')
  const [selectedId,   setSelectedId]   = useState<string | null>(null)

  const [newLoanOpen,    setNewLoanOpen]    = useState(false)
  const [repayTarget,    setRepayTarget]    = useState<Loan | null>(null)
  const [voidTarget,     setVoidTarget]     = useState<Loan | null>(null)

  const activeQuery = new URLSearchParams({
    status: 'active',
    ...(activeSearch && { search: activeSearch }),
    pageSize: '100',
  })
  const histQuery = new URLSearchParams({
    ...(histSearch && { search: histSearch }),
    ...(histFrom   && { from: histFrom }),
    ...(histTo     && { to: histTo }),
    pageSize: '100',
  })

  const { data: activeData,  isLoading: loadingActive }  = useSWR<{ loans: Loan[]; total: number }>(`/api/loans?${activeQuery}`, fetcher)
  const { data: historyData, isLoading: loadingHistory } = useSWR<{ loans: Loan[]; total: number }>(`/api/loans?${histQuery}`, fetcher)
  const { data: selectedLoan, isLoading: detailLoading } = useSWR<Loan>(
    selectedId ? `/api/loans/${selectedId}` : null,
    fetcher,
  )

  const activeLoans  = activeData?.loans  ?? []
  const historyLoans = historyData?.loans ?? []

  function revalidate() {
    mutate((key: string) => key.startsWith('/api/loans'))
  }

  // ── Active loans columns ─────────────────────────────────────────────────────
  const activeColumns: Column<Loan>[] = [
    {
      key: 'refNumber',
      header: 'Ref #',
      width: '130px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6C757D' }}>{r.refNumber}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${r.customer.firstName} ${r.customer.lastName}`} size={26} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>
              {r.customer.firstName} {r.customer.lastName}
            </p>
            <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{r.customer.idNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'principalAmount',
      header: 'Principal',
      width: '110px',
      render: (r) => (
        <span className="font-mono" style={{ fontSize: 12, color: '#6C757D' }}>
          {format.currency(r.principalAmount)}
        </span>
      ),
    },
    {
      key: 'balanceAmount',
      header: 'Balance',
      width: '110px',
      render: (r) => {
        const bal = new Decimal(r.balanceAmount)
        return (
          <span className="font-mono font-semibold" style={{ color: bal.gt(0) ? '#C9A020' : '#217346' }}>
            {format.currency(r.balanceAmount)}
          </span>
        )
      },
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      width: '90px',
      render: (r) => <span className="capitalize" style={{ fontSize: 12, color: '#6C757D' }}>{r.paymentMethod}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '100px',
      render: (r) => (
        <span style={{ fontSize: 11, color: '#6C757D' }}>
          {new Date(r.createdAt).toLocaleDateString('en-ZA')}
        </span>
      ),
    },
  ]

  const activeActions: RowAction<Loan>[] = [
    {
      label:   'Record Repayment',
      onClick: (r) => { setRepayTarget(r) },
    },
    {
      label:   'Void Loan',
      danger:  true,
      hidden:  () => !isManager,
      onClick: (r) => { setVoidTarget(r) },
    },
  ]

  // ── History columns ──────────────────────────────────────────────────────────
  const historyColumns: Column<Loan>[] = [
    {
      key: 'refNumber',
      header: 'Ref #',
      width: '130px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6C757D' }}>{r.refNumber}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>
            {r.customer.firstName} {r.customer.lastName}
          </p>
          <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{r.customer.idNumber}</p>
        </div>
      ),
    },
    {
      key: 'principalAmount',
      header: 'Principal',
      width: '110px',
      render: (r) => (
        <span className="font-mono" style={{ fontSize: 12, color: '#6C757D' }}>
          {format.currency(r.principalAmount)}
        </span>
      ),
    },
    {
      key: 'balanceAmount',
      header: 'Balance',
      width: '110px',
      render: (r) => (
        <span className="font-mono" style={{ fontSize: 12, color: '#6C757D' }}>
          {format.currency(r.balanceAmount)}
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
        <span style={{ fontSize: 11, color: '#6C757D' }}>
          {new Date(r.createdAt).toLocaleDateString('en-ZA')}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="shrink-0">
        <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Loans</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>Manage customer loan advances and repayments</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center shrink-0 border-b border-[#E0E0E0]">
        <button
          onClick={() => { setActiveTab('active'); setSelectedId(null) }}
          className="px-4 py-2 text-xs font-medium border-b-2 transition-colors"
          style={{ borderColor: activeTab === 'active' ? '#185ABD' : 'transparent', color: activeTab === 'active' ? '#185ABD' : '#6C757D' }}
        >
          Active Loans {activeData?.total ? `(${activeData.total})` : ''}
        </button>
        <button
          onClick={() => { setActiveTab('history'); setSelectedId(null) }}
          className="px-4 py-2 text-xs font-medium border-b-2 transition-colors"
          style={{ borderColor: activeTab === 'history' ? '#185ABD' : 'transparent', color: activeTab === 'history' ? '#185ABD' : '#6C757D' }}
        >
          History
        </button>
      </div>

      {/* Active tab */}
      {activeTab === 'active' && (
        <>
          <div className="shrink-0">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#6C757D' }} />
              <input
                value={activeSearch}
                onChange={(e) => setActiveSearch(e.target.value)}
                placeholder="Search by name, ID or ref…"
                className="pl-7 pr-3 py-1 text-xs rounded border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] w-full"
              />
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <DataTable
              columns={activeColumns}
              rows={activeLoans}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
              selectedKey={selectedId}
              rowActions={activeActions}
              loading={loadingActive}
              emptyMessage="No active loans"
              emptyAction={{ label: '+ New Loan', onClick: () => setNewLoanOpen(true) }}
            />
          </div>
          <InlineDetailPanel
            open={!!selectedId}
            onClose={() => setSelectedId(null)}
            title={
              selectedLoan
                ? `${selectedLoan.refNumber} · ${selectedLoan.customer.firstName} ${selectedLoan.customer.lastName}`
                : 'Repayment History'
            }
            height={260}
          >
            {detailLoading || !selectedLoan ? (
              <div className="flex items-center gap-2" style={{ color: '#6C757D', fontSize: 12 }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="flex gap-6 h-full">
                <div className="w-44 shrink-0 space-y-2">
                  <div>
                    <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Customer</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#212529' }}>
                      {selectedLoan.customer.firstName} {selectedLoan.customer.lastName}
                    </p>
                    <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{selectedLoan.customer.idNumber}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Principal</p>
                    <p className="font-mono" style={{ fontSize: 12, color: '#212529' }}>{format.currency(selectedLoan.principalAmount)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Balance</p>
                    <p className="font-mono font-semibold" style={{ fontSize: 12, color: new Decimal(selectedLoan.balanceAmount).gt(0) ? '#C9A020' : '#217346' }}>
                      {format.currency(selectedLoan.balanceAmount)}
                    </p>
                  </div>
                  {selectedLoan.notes && (
                    <div>
                      <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Notes</p>
                      <p style={{ fontSize: 11, color: '#212529' }}>{selectedLoan.notes}</p>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-auto">
                  <p className="uppercase tracking-wide font-semibold mb-2" style={{ fontSize: 10, color: '#6C757D' }}>Repayment History</p>
                  {!selectedLoan.repayments?.length ? (
                    <p style={{ fontSize: 12, color: '#6C757D' }}>No repayments yet</p>
                  ) : (
                    <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                          {['Ref', 'Amount', 'Method', 'Date', 'Notes'].map((h) => (
                            <th key={h} className="text-left pb-1" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6C757D' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLoan.repayments.map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #F1F3F4' }}>
                            <td className="font-mono py-1" style={{ color: '#6C757D', paddingRight: 12 }}>{r.refNumber}</td>
                            <td className="font-mono font-semibold py-1" style={{ color: '#217346', paddingRight: 12 }}>{format.currency(r.amount)}</td>
                            <td className="capitalize py-1" style={{ color: '#6C757D', paddingRight: 12 }}>{r.paymentMethod}</td>
                            <td className="py-1" style={{ color: '#6C757D', paddingRight: 12 }}>{new Date(r.createdAt).toLocaleDateString('en-ZA')}</td>
                            <td className="py-1" style={{ color: '#6C757D' }}>{r.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </InlineDetailPanel>
        </>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <>
          <div className="flex gap-2 flex-wrap shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#6C757D' }} />
              <input
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
                placeholder="Search by name, ID or ref…"
                className="pl-7 pr-3 py-1 text-xs rounded border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] w-56"
              />
            </div>
            <input
              type="date"
              value={histFrom}
              onChange={(e) => setHistFrom(e.target.value)}
              className="border border-[#E0E0E0] rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#185ABD]"
            />
            <input
              type="date"
              value={histTo}
              onChange={(e) => setHistTo(e.target.value)}
              className="border border-[#E0E0E0] rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#185ABD]"
            />
          </div>
          <div className="flex-1 min-h-0">
            <DataTable
              columns={historyColumns}
              rows={historyLoans}
              rowKey={(r) => r.id}
              loading={loadingHistory}
              emptyMessage="No loan history found"
            />
          </div>
        </>
      )}

      {/* ── New Loan Dialog ── */}
      {newLoanOpen && (
        <NewLoanDialog
          onClose={() => setNewLoanOpen(false)}
          onSuccess={() => { revalidate(); setNewLoanOpen(false) }}
        />
      )}

      {/* ── Repay Dialog ── */}
      {repayTarget && (
        <RepayDialog
          loan={repayTarget}
          onClose={() => setRepayTarget(null)}
          onSuccess={() => { revalidate(); setRepayTarget(null) }}
        />
      )}

      {/* ── Void Dialog ── */}
      {voidTarget && (
        <VoidLoanDialog
          loan={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => { revalidate(); setVoidTarget(null) }}
        />
      )}
    </div>
  )
}

// ─── New Loan Dialog ──────────────────────────────────────────────────────────
function NewLoanDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [customer,  setCustomer]  = useState<SelectedCustomer | null>(null)
  const [amount,    setAmount]    = useState('')
  const [method,    setMethod]    = useState('cash')
  const [notes,     setNotes]     = useState('')
  const [loading,   setLoading]   = useState(false)

  async function onSubmit() {
    if (!customer || !amount) return
    setLoading(true)
    const res = await fetch('/api/loans', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ customerId: customer.id, principalAmount: amount, paymentMethod: method, notes: notes || undefined }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Loan advance created'); onSuccess() }
    else {
      const j = await res.json() as { error?: string | { formErrors?: string[] } }
      const msg = typeof j.error === 'string' ? j.error : (j.error as { formErrors?: string[] })?.formErrors?.[0] ?? 'Failed'
      toast.error(msg)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Loan Advance</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="mb-1 block">Customer</Label>
            <CustomerLookupWidget onSelect={(c) => setCustomer(c)} selectedCustomer={customer} />
            {customer?.blacklisted && (
              <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#C0392B' }}>
                <AlertCircle className="w-3 h-3" /> This customer is blacklisted
              </p>
            )}
          </div>
          <div>
            <Label>Advance Amount (R)</Label>
            <Input placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes <span className="font-normal" style={{ color: '#6C757D' }}>(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button style={{ background: '#217346' }} className="hover:opacity-90" onClick={onSubmit} disabled={loading || !customer || !amount}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</> : 'Create Loan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Repay Dialog ─────────────────────────────────────────────────────────────
function RepayDialog({ loan, onClose, onSuccess }: { loan: Loan; onClose: () => void; onSuccess: () => void }) {
  const [amount,  setAmount]  = useState(loan.balanceAmount.toString())
  const [method,  setMethod]  = useState('cash')
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (!amount) return
    setLoading(true)
    const res = await fetch(`/api/loans/${loan.id}/repay`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ amount, paymentMethod: method, notes: notes || undefined }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Repayment recorded'); onSuccess() }
    else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Repayment</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
            <p className="font-medium" style={{ color: '#212529' }}>{loan.customer.firstName} {loan.customer.lastName}</p>
            <p style={{ color: '#6C757D' }}>Ref: {loan.refNumber}</p>
            <p style={{ color: '#6C757D' }}>
              Principal: {format.currency(loan.principalAmount)} ·{' '}
              Balance: <span className="font-semibold" style={{ color: '#C9A020' }}>{format.currency(loan.balanceAmount)}</span>
            </p>
          </div>
          <div>
            <Label>Repayment Amount (R)</Label>
            <Input placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes <span className="font-normal" style={{ color: '#6C757D' }}>(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button style={{ background: '#217346' }} className="hover:opacity-90" onClick={onSubmit} disabled={loading || !amount}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Record Repayment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Void Loan Dialog ─────────────────────────────────────────────────────────
function VoidLoanDialog({ loan, onClose, onSuccess }: { loan: Loan; onClose: () => void; onSuccess: () => void }) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (reason.length < 5) return
    setLoading(true)
    const res = await fetch(`/api/loans/${loan.id}/void`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Loan voided'); onSuccess() }
    else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle style={{ color: '#C0392B' }}>Void Loan</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #C0392B30' }}>
            <p className="font-medium" style={{ color: '#C0392B' }}>
              {loan.customer.firstName} {loan.customer.lastName} — {loan.refNumber}
            </p>
            <p className="text-xs mt-1" style={{ color: '#C0392B' }}>
              This will void the loan of {format.currency(loan.principalAmount)}. Cannot be undone.
            </p>
          </div>
          <div>
            <Label>Reason for Void</Label>
            <Textarea
              placeholder="Enter a reason (min 5 characters)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={onSubmit} disabled={loading || reason.length < 5}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Voiding…</> : 'Void Loan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
