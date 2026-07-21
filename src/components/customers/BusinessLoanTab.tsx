'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Loader2, MoreHorizontal, Lock } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { format } from '@/lib/utils/format'
import { HEADER_GRAD, NAVY, lbl, Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type BusinessLoan = {
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
  _count?: { repayments: number }
}

type BusinessLoanSummaryResponse = {
  hasOutstanding: boolean
  totalAdvanced?: string
  totalRepaid?: string
  outstanding?: string
  loans?: BusinessLoan[]
}

interface BusinessLoanTabProps {
  customerId: string
  customerName: string
  userRole: string
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT' },
]

function SHdr({ title }: { title: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{title}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: 'active' | 'settled' | 'voided' }) {
  const styles: Record<typeof status, { bg: string; color: string; text: string }> = {
    active: { bg: '#DBEAFE', color: '#1E40AF', text: 'Active' },
    settled: { bg: '#DCFCE7', color: '#166534', text: 'Settled' },
    voided: { bg: '#F3F4F6', color: '#6B7280', text: 'Voided' },
  }
  const s = styles[status]
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 2,
        padding: '1px 6px',
        background: s.bg,
        color: s.color,
      }}
    >
      {s.text}
    </span>
  )
}

export function BusinessLoanTab({ customerId, customerName, userRole }: BusinessLoanTabProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [repayTarget, setRepayTarget] = useState<BusinessLoan | null>(null)
  const [voidTarget, setVoidTarget] = useState<BusinessLoan | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const { data, isLoading } = useSWR<BusinessLoanSummaryResponse>(
    `/api/customers/${customerId}/business-loans`, fetcher)

  const isAdmin = userRole === 'admin'
  const loans = data?.loans ?? []

  function revalidate() {
    mutate(`/api/customers/${customerId}/business-loans`)
  }

  function canVoidLoan(loan: BusinessLoan): boolean {
    return isAdmin && loan.status === 'active' && (loan._count?.repayments ?? 0) === 0
  }

  const outstanding = data?.outstanding ? new Decimal(data.outstanding) : new Decimal(0)

  if (isLoading) {
    return (
      <div>
        <SHdr title="Business Loan" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 12, gap: 8 }}>
          <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
          Loading...
        </div>
      </div>
    )
  }

  // Manager (or any non-admin) view: existence-only, no figures, no actions.
  if (!isAdmin) {
    return (
      <div>
        <SHdr title="Business Loan" />
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 4,
              background: data?.hasOutstanding ? '#FFF3E0' : '#F3F4F6',
              border: `1px solid ${data?.hasOutstanding ? '#FFCC80' : '#E5E7EB'}`,
            }}
          >
            <Lock style={{ width: 13, height: 13, color: data?.hasOutstanding ? '#E65100' : '#9CA3AF' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: data?.hasOutstanding ? '#E65100' : '#6B7280' }}>
              {data?.hasOutstanding ? 'Business loan outstanding' : 'No business loan'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>
            Loan figures are only visible to a system admin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SHdr title="Business Loan" />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid #E0E0E0',
          background: '#FAFAFA',
        }}
      >
        <div>
          <span style={lbl}>Outstanding Balance</span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: outstanding.gt(0) ? '#D97706' : '#059669',
            }}
          >
            {format.currency(outstanding.toString())}
          </span>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            fontSize: 11,
            padding: '4px 12px',
            borderRadius: 2,
            cursor: 'pointer',
            background: 'linear-gradient(180deg,#10B981 0%,#059669 100%)',
            border: '1px solid #059669',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          + New Loan
        </button>
      </div>

      {loans.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 12 }}>
            No business loans for this customer
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 2,
              cursor: 'pointer',
              background: 'linear-gradient(180deg,#10B981 0%,#059669 100%)',
              border: '1px solid #059669',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            + Create Loan
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'linear-gradient(180deg,#F5F5F5 0%,#EBEBEB 100%)', borderBottom: '1px solid #C0C0C0' }}>
                {['Reference', 'Amount', 'Balance', 'Status', 'Date', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '5px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#6C757D',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loans.map((loan, i) => (
                <tr
                  key={loan.id}
                  style={{
                    borderBottom: '1px solid #F0F0F0',
                    background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                    opacity: loan.status === 'voided' ? 0.5 : 1,
                  }}
                >
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 11 }}>{loan.refNumber}</td>
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>{format.currency(loan.principalAmount)}</td>
                  <td
                    style={{
                      padding: '5px 10px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: new Decimal(loan.balanceAmount).gt(0) ? '#D97706' : '#059669',
                    }}
                  >
                    {format.currency(loan.balanceAmount)}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <StatusBadge status={loan.status} />
                  </td>
                  <td style={{ padding: '5px 10px', color: '#6C757D' }}>
                    {new Date(loan.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
                  </td>
                  <td style={{ padding: '5px 10px', width: 40, position: 'relative' }}>
                    {loan.status === 'active' && new Decimal(loan.balanceAmount).gt(0) && (
                      <>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === loan.id ? null : loan.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 2 }}
                        >
                          <MoreHorizontal style={{ width: 14, height: 14, color: '#6C757D' }} />
                        </button>
                        {menuOpenId === loan.id && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: '100%',
                              background: '#fff',
                              border: '1px solid #E0E0E0',
                              borderRadius: 4,
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                              zIndex: 10,
                              minWidth: 120,
                            }}
                          >
                            <button
                              onClick={() => { setRepayTarget(loan); setMenuOpenId(null) }}
                              style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#374151' }}
                            >
                              Repay
                            </button>
                            {canVoidLoan(loan) && (
                              <button
                                onClick={() => { setVoidTarget(loan); setMenuOpenId(null) }}
                                style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}
                              >
                                Void Loan
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateBusinessLoanDialog
          customerId={customerId}
          customerName={customerName}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { revalidate(); setCreateOpen(false) }}
        />
      )}

      {repayTarget && (
        <RepayBusinessLoanDialog
          loan={repayTarget}
          customerName={customerName}
          onClose={() => setRepayTarget(null)}
          onSuccess={() => { revalidate(); setRepayTarget(null) }}
        />
      )}

      {voidTarget && (
        <VoidBusinessLoanDialog
          loan={voidTarget}
          customerName={customerName}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => { revalidate(); setVoidTarget(null) }}
        />
      )}
    </div>
  )
}

// ─── Create Business Loan Dialog ────────────────────────────────────────────
function CreateBusinessLoanDialog({
  customerId,
  customerName,
  onClose,
  onSuccess,
}: {
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (!amount) return
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/business-loans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principalAmount: amount,
        paymentMethod: method,
        notes: notes || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Business loan created')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string | { formErrors?: string[] } }
      const msg =
        typeof j.error === 'string'
          ? j.error
          : (j.error as { formErrors?: string[] })?.formErrors?.[0] ?? 'Failed to create business loan'
      toast.error(msg)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title={`Create Business Loan for ${customerName}`} onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            <div>
              <Label>Amount (R) *</Label>
              <Input
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                type="number"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <Label>Payment Method *</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
                <SelectTrigger className="mt-1 w-full">
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
              <Label>Notes <span className="font-normal text-gray-400">(optional)</span></Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" maxLength={500} />
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" onClick={onSubmit} disabled={!amount} loading={loading}>Create Loan</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Repay Business Loan Dialog ─────────────────────────────────────────────
function RepayBusinessLoanDialog({
  loan,
  customerName,
  onClose,
  onSuccess,
}: {
  loan: BusinessLoan
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (!amount) return
    setLoading(true)
    const res = await fetch(`/api/business-loans/${loan.id}/repay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, paymentMethod: method }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Repayment recorded')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string }
      toast.error(j.error ?? 'Failed to record repayment')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title={`Repay ${customerName}`} onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            <p className="text-xs" style={{ color: '#6C757D' }}>
              {loan.refNumber} — Balance {format.currency(loan.balanceAmount)}
            </p>
            <div>
              <Label>Amount (R) *</Label>
              <Input
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                type="number"
                step="0.01"
                min="0"
                max={loan.balanceAmount}
              />
            </div>
            <div>
              <Label>Payment Method *</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" onClick={onSubmit} disabled={!amount} loading={loading}>Repay</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Void Business Loan Dialog ──────────────────────────────────────────────
function VoidBusinessLoanDialog({
  loan,
  customerName,
  onClose,
  onSuccess,
}: {
  loan: BusinessLoan
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (reason.length < 5) return
    setLoading(true)
    const res = await fetch(`/api/business-loans/${loan.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Business loan voided')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string }
      toast.error(j.error ?? 'Failed to void business loan')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Void Business Loan" onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            <div className="rounded p-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="font-medium" style={{ color: '#DC2626' }}>{customerName} — {loan.refNumber}</p>
              <p className="text-xs mt-1" style={{ color: '#DC2626' }}>
                This will void the business loan of {format.currency(loan.principalAmount)}. This action cannot be undone.
              </p>
            </div>
            <div>
              <Label>Reason for Void *</Label>
              <Textarea
                placeholder="Enter a reason (min 5 characters)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1"
                maxLength={500}
              />
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={onSubmit} disabled={reason.length < 5} loading={loading}>Void Loan</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
