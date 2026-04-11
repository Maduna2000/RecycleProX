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
import { Plus, Search, Ban, Loader2, TrendingDown, AlertCircle, HandCoins } from 'lucide-react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'
import { CustomerLookupWidget } from '@/components/CustomerLookupWidget'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Payment = {
  id: string
  refNumber: string
  amount: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string }
}

type AccountBalance = {
  id: string; firstName: string; lastName: string; idNumber: string; phone: string
  totalPurchases: string; totalPaid: string; balance: string
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; blacklisted: boolean; priceGroupId?: string | null
}

export default function PaymentsPage() {
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [includeVoided, setIncludeVoided] = useState(false)
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const query = new URLSearchParams({
    ...(search && { search }),
    ...(includeVoided && { includeVoided: 'true' }),
    pageSize: '50',
  })

  const { data: paymentsData } = useSWR<{ payments: Payment[]; total: number }>(`/api/payments?${query}`, fetcher)
  const { data: balancesData } = useSWR<{ balances: AccountBalance[] }>('/api/payments/balances', fetcher)

  const payments = paymentsData?.payments ?? []
  const balances = balancesData?.balances ?? []
  const outstandingCount = balances.filter((b) => parseFloat(b.balance) > 0).length

  function revalidate() {
    mutate(`/api/payments?${query}`)
    mutate('/api/payments/balances')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Account customer payouts</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setNewPaymentOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Record Payment
        </Button>
      </div>

      <Tabs defaultValue="payments">
        <TabsList className="mb-4">
          <TabsTrigger value="payments">Payment History</TabsTrigger>
          <TabsTrigger value="balances" className="relative">
            Account Balances
            {outstandingCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">
                {outstandingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Payments Tab ── */}
        <TabsContent value="payments">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search ref or customer..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVoided}
                onChange={(e) => setIncludeVoided(e.target.checked)}
                className="rounded"
              />
              Include voided
            </label>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            {payments.length === 0 ? (
              <div className="p-10 text-center text-gray-400">No payments found</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Ref #', 'Customer', 'Amount', 'Method', 'Date', 'Status', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id} className={`hover:bg-gray-50 ${p.voidedAt ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.refNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.customer.firstName} {p.customer.lastName}</p>
                        <p className="text-xs text-gray-400 font-mono">{p.customer.idNumber}</p>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900">
                        R {Number(p.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-500">{p.paymentMethod}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{format.datetime(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        {p.voidedAt
                          ? <Badge variant="destructive">Voided</Badge>
                          : <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Paid</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        {isManager && !p.voidedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setVoidTarget(p)}
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ── Balances Tab ── */}
        <TabsContent value="balances">
          <div className="bg-white rounded-xl border overflow-hidden">
            {balances.length === 0 ? (
              <div className="p-10 text-center text-gray-400">No account customers found</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Customer', 'Total Purchases', 'Total Paid', 'Outstanding Balance', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {balances.map((b) => {
                    const outstanding = parseFloat(b.balance)
                    return (
                      <tr key={b.id} className={outstanding > 0 ? 'bg-orange-50' : ''}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{b.firstName} {b.lastName}</p>
                          <p className="text-xs text-gray-400 font-mono">{b.idNumber}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-700">R {Number(b.totalPurchases).toFixed(2)}</td>
                        <td className="px-4 py-3 font-mono text-green-700">R {Number(b.totalPaid).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {outstanding > 0 && <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />}
                            <span className={`font-mono font-semibold ${outstanding > 0 ? 'text-orange-700' : 'text-gray-500'}`}>
                              R {outstanding.toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {outstanding > 0 && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-xs"
                              onClick={() => setNewPaymentOpen(true)}
                            >
                              <TrendingDown className="w-3.5 h-3.5 mr-1" /> Pay Out
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {newPaymentOpen && (
        <NewPaymentModal
          onClose={() => setNewPaymentOpen(false)}
          onSuccess={() => { revalidate(); setNewPaymentOpen(false) }}
        />
      )}
      {voidTarget && (
        <VoidPaymentModal
          payment={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => { revalidate(); setVoidTarget(null) }}
        />
      )}
    </div>
  )
}

// ─── New Payment Modal ────────────────────────────────────────────────────────
function NewPaymentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: balanceData } = useSWR(
    customer ? `/api/customers/${customer.id}/balance` : null,
    fetcher
  )

  const { data: loanData } = useSWR<{ summary: { outstanding: string; hasOutstanding: boolean } }>(
    customer ? `/api/customers/${customer.id}/loans?pageSize=1` : null,
    fetcher
  )
  const hasOutstandingLoan  = loanData?.summary?.hasOutstanding ?? false
  const outstandingLoanAmt  = loanData?.summary?.outstanding ?? '0'

  async function onSubmit() {
    if (!customer) { toast.error('Select a customer'); return }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return }

    setLoading(true)
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, amount, paymentMethod, notes: notes || undefined }),
    })
    setLoading(false)

    if (res.ok) {
      const data = await res.json()
      toast.success(`Payment ${data.refNumber} recorded`)
      onSuccess()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to record payment')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Customer */}
          <div>
            <Label className="mb-2 block">Account Customer</Label>
            {!customer ? (
              <CustomerLookupWidget onSelect={(c) => setCustomer(c)} />
            ) : (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{customer.firstName} {customer.lastName}</p>
                  <p className="text-xs text-gray-500 font-mono">{customer.idNumber}</p>
                  {balanceData && (
                    <p className="text-xs mt-0.5">
                      Outstanding: <span className={`font-semibold ${parseFloat(balanceData.balance) > 0 ? 'text-orange-600' : 'text-gray-500'}`}>
                        R {Number(balanceData.balance).toFixed(2)}
                      </span>
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>Change</Button>
              </div>
            )}
          </div>

          {/* Outstanding loan banner */}
          {customer && hasOutstandingLoan && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
              <HandCoins className="w-4 h-4 shrink-0" />
              <span>
                Outstanding loan: <strong>R {new Decimal(outstandingLoanAmt).toFixed(2)}</strong>
              </span>
              <a href="/app/loans" className="ml-auto font-semibold underline-offset-2 hover:underline shrink-0">
                View →
              </a>
            </div>
          )}

          {/* Amount */}
          <div>
            <Label>Amount (R)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 font-mono"
              disabled={loading}
            />
            {balanceData && parseFloat(balanceData.balance) > 0 && (
              <button
                type="button"
                className="text-xs text-green-600 hover:underline mt-1"
                onClick={() => setAmount(Number(balanceData.balance).toFixed(2))}
              >
                Use full balance (R {Number(balanceData.balance).toFixed(2)})
              </button>
            )}
          </div>

          {/* Payment method */}
          <div>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="amplopay">AmploPay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" disabled={loading} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={onSubmit} disabled={loading || !customer}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Record Payment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Void Payment Modal ───────────────────────────────────────────────────────
function VoidPaymentModal({ payment, onClose, onSuccess }: { payment: Payment; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/payments/${payment.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Payment voided'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void payment') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-red-600">Void Payment</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-gray-600">
            Void <span className="font-semibold">{payment.refNumber}</span> (R {Number(payment.amount).toFixed(2)}) to{' '}
            <span className="font-semibold">{payment.customer.firstName} {payment.customer.lastName}</span>?
            This cannot be undone.
          </p>
          <div>
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Min 5 characters"
              className="mt-1"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={loading || reason.trim().length < 5}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Voiding...</> : 'Confirm Void'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
