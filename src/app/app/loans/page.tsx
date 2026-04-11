'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, Loader2, HandCoins, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'
import { CustomerLookupWidget } from '@/components/CustomerLookupWidget'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = { id: string; firstName: string; lastName: string; idNumber: string }

type Repayment = {
  id: string; refNumber: string; amount: string
  paymentMethod: string; notes?: string; createdAt: string
}

type Loan = {
  id: string
  refNumber: string
  principalAmount: string
  balanceAmount: string
  paymentMethod: string
  notes?: string
  status: 'active' | 'settled' | 'voided'
  voidedAt?: string
  voidReason?: string
  createdAt: string
  customer: Customer
  _count?: { repayments: number }
  repayments?: Repayment[]
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; customerType: string; blacklisted: boolean; priceGroupId?: string | null
}

const PAYMENT_METHODS = [
  { value: 'cash',      label: 'Cash' },
  { value: 'eft',       label: 'EFT' },
  { value: 'cheque',    label: 'Cheque' },
  { value: 'amplopay',  label: 'AmploPay' },
]

const statusBadge = (status: string) => {
  if (status === 'active')  return <Badge className="bg-blue-100 text-blue-800 border-0">Active</Badge>
  if (status === 'settled') return <Badge className="bg-green-100 text-green-800 border-0">Settled</Badge>
  return <Badge className="bg-red-100 text-red-800 border-0">Voided</Badge>
}

export default function LoansPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  // ── List state ───────────────────────────────────────────────────────────────
  const [activeSearch, setActiveSearch]   = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyFrom,   setHistoryFrom]   = useState('')
  const [historyTo,     setHistoryTo]     = useState('')
  const [expandedId,    setExpandedId]    = useState<string | null>(null)

  // ── Dialog state ─────────────────────────────────────────────────────────────
  const [newLoanOpen,    setNewLoanOpen]    = useState(false)
  const [repayTarget,    setRepayTarget]    = useState<Loan | null>(null)
  const [voidTarget,     setVoidTarget]     = useState<Loan | null>(null)

  // ── New loan form ─────────────────────────────────────────────────────────────
  const [loanCustomer,   setLoanCustomer]   = useState<SelectedCustomer | null>(null)
  const [loanAmount,     setLoanAmount]     = useState('')
  const [loanMethod,     setLoanMethod]     = useState('cash')
  const [loanNotes,      setLoanNotes]      = useState('')
  const [loanSubmitting, setLoanSubmitting] = useState(false)

  // ── Repayment form ────────────────────────────────────────────────────────────
  const [repayAmount,     setRepayAmount]     = useState('')
  const [repayMethod,     setRepayMethod]     = useState('cash')
  const [repayNotes,      setRepayNotes]      = useState('')
  const [repaySubmitting, setRepaySubmitting] = useState(false)

  // ── Void form ─────────────────────────────────────────────────────────────────
  const [voidReason,     setVoidReason]     = useState('')
  const [voidSubmitting, setVoidSubmitting] = useState(false)

  // ── Queries ───────────────────────────────────────────────────────────────────
  const activeQuery = new URLSearchParams({
    status: 'active',
    ...(activeSearch && { search: activeSearch }),
    pageSize: '100',
  })
  const historyQuery = new URLSearchParams({
    ...(historySearch && { search: historySearch }),
    ...(historyFrom   && { from: historyFrom }),
    ...(historyTo     && { to: historyTo }),
    pageSize: '100',
  })

  const { data: activeData,  isLoading: loadingActive }  = useSWR<{ loans: Loan[]; total: number }>(`/api/loans?${activeQuery}`, fetcher)
  const { data: historyData, isLoading: loadingHistory } = useSWR<{ loans: Loan[]; total: number }>(`/api/loans?${historyQuery}`, fetcher)

  const activeLoans  = activeData?.loans ?? []
  const historyLoans = historyData?.loans ?? []

  // ── Expanded loan detail ──────────────────────────────────────────────────────
  const { data: expandedLoan } = useSWR<Loan>(
    expandedId ? `/api/loans/${expandedId}` : null,
    fetcher
  )

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleCreateLoan() {
    if (!loanCustomer || !loanAmount) return
    setLoanSubmitting(true)
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId:      loanCustomer.id,
          principalAmount: loanAmount,
          paymentMethod:   loanMethod,
          notes:           loanNotes || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string | { formErrors?: string[] } }
        const msg = typeof j.error === 'string' ? j.error : (j.error as { formErrors?: string[] })?.formErrors?.[0] ?? 'Failed to create loan'
        toast.error(msg)
        return
      }
      toast.success('Loan advance created')
      setNewLoanOpen(false)
      setLoanCustomer(null); setLoanAmount(''); setLoanMethod('cash'); setLoanNotes('')
      mutate((key: string) => key.startsWith('/api/loans'))
    } finally {
      setLoanSubmitting(false)
    }
  }

  async function handleRepay() {
    if (!repayTarget || !repayAmount) return
    setRepaySubmitting(true)
    try {
      const res = await fetch(`/api/loans/${repayTarget.id}/repay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: repayAmount, paymentMethod: repayMethod, notes: repayNotes || undefined }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        toast.error(j.error ?? 'Failed to record repayment')
        return
      }
      toast.success('Repayment recorded')
      setRepayTarget(null); setRepayAmount(''); setRepayMethod('cash'); setRepayNotes('')
      mutate((key: string) => key.startsWith('/api/loans'))
    } finally {
      setRepaySubmitting(false)
    }
  }

  async function handleVoid() {
    if (!voidTarget || !voidReason) return
    setVoidSubmitting(true)
    try {
      const res = await fetch(`/api/loans/${voidTarget.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        toast.error(j.error ?? 'Failed to void loan')
        return
      }
      toast.success('Loan voided')
      setVoidTarget(null); setVoidReason('')
      mutate((key: string) => key.startsWith('/api/loans'))
    } finally {
      setVoidSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loans</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage customer loan advances and repayments</p>
        </div>
        <Button onClick={() => setNewLoanOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Loan
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Active Loans {activeData?.total ? `(${activeData.total})` : ''}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── Active Loans ── */}
        <TabsContent value="active" className="mt-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, ID or ref…"
                className="pl-8"
                value={activeSearch}
                onChange={(e) => setActiveSearch(e.target.value)}
              />
            </div>
          </div>

          {loadingActive && <p className="text-sm text-gray-400">Loading…</p>}

          {!loadingActive && activeLoans.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <HandCoins className="w-10 h-10 opacity-30" />
              <p className="text-sm">No active loans</p>
            </div>
          )}

          {activeLoans.length > 0 && (
            <div className="rounded-xl border overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Ref</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">ID No</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Principal</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Balance</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeLoans.map((loan) => (
                    <>
                      <tr key={loan.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{loan.refNumber}</td>
                        <td className="px-4 py-3 font-medium">
                          {loan.customer.firstName} {loan.customer.lastName}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{loan.customer.idNumber}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {format.currency(loan.principalAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600">
                          {format.currency(loan.balanceAmount)}
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-500">{loan.paymentMethod}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(loan.createdAt).toLocaleDateString('en-ZA')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setExpandedId(expandedId === loan.id ? null : loan.id)
                              }}
                            >
                              {expandedId === loan.id
                                ? <ChevronDown className="w-3 h-3" />
                                : <ChevronRight className="w-3 h-3" />}
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                setRepayTarget(loan)
                                setRepayAmount(loan.balanceAmount.toString())
                                setRepayMethod('cash')
                                setRepayNotes('')
                              }}
                            >
                              Repay
                            </Button>
                            {isManager && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                onClick={() => { setVoidTarget(loan); setVoidReason('') }}
                              >
                                Void
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Repayment history expansion */}
                      {expandedId === loan.id && (
                        <tr key={`${loan.id}-expand`}>
                          <td colSpan={8} className="px-6 pb-3 bg-gray-50">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-2">
                              Repayment History
                            </p>
                            {!expandedLoan ? (
                              <p className="text-xs text-gray-400">Loading…</p>
                            ) : expandedLoan.repayments?.length === 0 ? (
                              <p className="text-xs text-gray-400">No repayments yet</p>
                            ) : (
                              <div className="space-y-1">
                                {expandedLoan.repayments?.map((r) => (
                                  <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-100">
                                    <span className="font-mono text-gray-400">{r.refNumber}</span>
                                    <span className="font-medium text-green-700">{format.currency(r.amount)}</span>
                                    <span className="capitalize text-gray-500">{r.paymentMethod}</span>
                                    <span className="text-gray-400">
                                      {new Date(r.createdAt).toLocaleDateString('en-ZA')}
                                    </span>
                                    {r.notes && <span className="text-gray-400 max-w-xs truncate">{r.notes}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {loan.notes && (
                              <p className="text-xs text-gray-400 mt-2">Note: {loan.notes}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, ID or ref…"
                className="pl-8"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
            <Input type="date" className="w-36" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
            <Input type="date" className="w-36" value={historyTo}   onChange={(e) => setHistoryTo(e.target.value)} />
          </div>

          {loadingHistory && <p className="text-sm text-gray-400">Loading…</p>}

          {!loadingHistory && historyLoans.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <HandCoins className="w-10 h-10 opacity-30" />
              <p className="text-sm">No loan history found</p>
            </div>
          )}

          {historyLoans.length > 0 && (
            <div className="rounded-xl border overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Ref</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Principal</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Balance</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyLoans.map((loan) => (
                    <tr key={loan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{loan.refNumber}</td>
                      <td className="px-4 py-3 font-medium">
                        {loan.customer.firstName} {loan.customer.lastName}
                        <span className="ml-2 text-xs text-gray-400">{loan.customer.idNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{format.currency(loan.principalAmount)}</td>
                      <td className="px-4 py-3 text-right">{format.currency(loan.balanceAmount)}</td>
                      <td className="px-4 py-3">{statusBadge(loan.status)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(loan.createdAt).toLocaleDateString('en-ZA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── New Loan Dialog ── */}
      <Dialog open={newLoanOpen} onOpenChange={setNewLoanOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Loan Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="mb-1 block">Customer</Label>
              <CustomerLookupWidget
                onSelect={(c) => setLoanCustomer(c)}
                selectedCustomer={loanCustomer}
              />
              {loanCustomer?.blacklisted && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> This customer is blacklisted
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="loanAmount">Advance Amount (R)</Label>
              <Input
                id="loanAmount"
                placeholder="0.00"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="loanMethod">Payment Method</Label>
              <Select value={loanMethod} onValueChange={(v) => setLoanMethod(v ?? 'cash')}>
                <SelectTrigger id="loanMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="loanNotes">Notes (optional)</Label>
              <Textarea
                id="loanNotes"
                placeholder="Reason for advance…"
                value={loanNotes}
                onChange={(e) => setLoanNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setNewLoanOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreateLoan}
                disabled={loanSubmitting || !loanCustomer || !loanAmount}
              >
                {loanSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Loan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Repay Dialog ── */}
      {repayTarget && (
        <Dialog open onOpenChange={() => setRepayTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Repayment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="rounded-lg bg-gray-50 border p-3 text-sm space-y-1">
                <p className="font-medium">{repayTarget.customer.firstName} {repayTarget.customer.lastName}</p>
                <p className="text-gray-500">Ref: {repayTarget.refNumber}</p>
                <p className="text-gray-500">
                  Principal: {format.currency(repayTarget.principalAmount)} ·
                  Balance: <span className="font-semibold text-orange-600">{format.currency(repayTarget.balanceAmount)}</span>
                </p>
              </div>

              <div>
                <Label htmlFor="repayAmount">Repayment Amount (R)</Label>
                <Input
                  id="repayAmount"
                  placeholder="0.00"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="repayMethod">Payment Method</Label>
                <Select value={repayMethod} onValueChange={(v) => setRepayMethod(v ?? 'cash')}>
                  <SelectTrigger id="repayMethod"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="repayNotes">Notes (optional)</Label>
                <Textarea
                  id="repayNotes"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setRepayTarget(null)}>Cancel</Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleRepay}
                  disabled={repaySubmitting || !repayAmount}
                >
                  {repaySubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Record Repayment
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Void Dialog ── */}
      {voidTarget && (
        <Dialog open onOpenChange={() => setVoidTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Void Loan</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm">
                <p className="font-medium text-red-800">
                  {voidTarget.customer.firstName} {voidTarget.customer.lastName} — {voidTarget.refNumber}
                </p>
                <p className="text-red-600 text-xs mt-1">
                  This will void the loan of {format.currency(voidTarget.principalAmount)}.
                  This action cannot be undone.
                </p>
              </div>

              <div>
                <Label htmlFor="voidReason">Reason for Void</Label>
                <Textarea
                  id="voidReason"
                  placeholder="Enter a reason (min 5 characters)…"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setVoidTarget(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleVoid}
                  disabled={voidSubmitting || voidReason.length < 5}
                >
                  {voidSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Void Loan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
