'use client'

import { useState, useEffect } from 'react'
import { HandCoins, AlertCircle, Split } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { SaleSplitPaymentModal } from './SaleSplitPaymentModal'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

export type PayTarget = {
  id: string
  ref: string
  totalAmount: string
  amountPaid: string
  businessLoanDeductionAmount?: string
  customerId?: string | null
}

export function RecordPaymentModal({
  sale,
  onClose,
  onSuccess,
}: {
  sale: PayTarget
  onClose: () => void
  onSuccess: () => void
}) {
  const [method,      setMethod]      = useState<'cash' | 'eft'>('cash')
  const [amount,      setAmount]      = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [showSplit,   setShowSplit]   = useState(false)
  const [hasOutstandingBusinessLoan, setHasOutstandingBusinessLoan] = useState(false)

  const totalAmount = new Decimal(sale.totalAmount)
  const alreadyPaid = new Decimal(sale.amountPaid)
  const remaining   = totalAmount.minus(alreadyPaid)

  // Existence-only — never a figure without going through Split Payment's PIN gate.
  useEffect(() => {
    if (!sale.customerId) return
    let cancelled = false
    fetch(`/api/customers/${sale.customerId}/business-loans`)
      .then((r) => r.json())
      .then((d: { hasOutstanding?: boolean }) => { if (!cancelled) setHasOutstandingBusinessLoan(d.hasOutstanding === true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [sale.customerId])

  function validateAmount(raw: string): string | null {
    if (!raw.trim()) return 'Amount is required'
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'Enter a valid amount (e.g. 150.00)'
    const d = new Decimal(raw)
    if (d.lt(new Decimal('0.01'))) return 'Minimum amount is R0.01'
    if (d.gt(remaining)) return `Cannot exceed remaining balance of R ${remaining.toFixed(2)}`
    return null
  }

  async function handlePay() {
    const err = validateAmount(amount)
    if (err) { setAmountError(err); return }
    setAmountError(null)
    setLoading(true)
    const res = await fetch(`/api/sales/${sale.id}/mark-paid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, paymentMethod: method }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(`Payment recorded for ${sale.ref}`)
      onSuccess()
    } else {
      const j = await res.json() as { error?: string }
      toast.error(j.error ?? 'Failed to record payment')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={400}>
        <RpxDialogHeader title="Record Payment" icon={HandCoins} onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
          {/* Balance summary */}
          <div className="px-3 py-2.5 rounded-lg space-y-1" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
            <p className="font-mono font-medium" style={{ fontSize: 12, color: '#212529' }}>{sale.ref}</p>
            <div className="flex justify-between" style={{ fontSize: 12, color: '#6C757D' }}>
              <span>Total amount</span>
              <span className="font-mono">R {totalAmount.toFixed(2)}</span>
            </div>
            {alreadyPaid.gt(0) && (
              <div className="flex justify-between" style={{ fontSize: 12, color: '#217346' }}>
                <span>Already paid</span>
                <span className="font-mono">− R {alreadyPaid.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-[#E0E0E0] mt-1" style={{ fontSize: 13 }}>
              <span className="font-semibold" style={{ color: '#C9A020' }}>Remaining balance</span>
              <span className="font-mono font-bold" style={{ color: '#C9A020' }}>R {remaining.toFixed(2)}</span>
            </div>
          </div>

          {/* Business loan alert — existence-only, no figure */}
          {hasOutstandingBusinessLoan && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: '#FFF3E0', border: '1px solid #FFCC80' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E65100' }} />
              <div>
                <p className="text-xs font-medium" style={{ color: '#E65100' }}>
                  This customer has a pending business loan
                </p>
                <p className="text-xs" style={{ color: '#EF6C00' }}>
                  Use Split Payment to apply this sale toward it.
                </p>
              </div>
            </div>
          )}

          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: '#6C757D' }}>Amount Received</label>
              <button
                type="button"
                onClick={() => { setAmount(remaining.toFixed(2)); setAmountError(null) }}
                className="text-xs underline"
                style={{ color: '#217346' }}
              >
                Pay full balance
              </button>
            </div>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountError(null) }}
              className="h-8 text-[12px] font-mono"
            />
            {amountError && (
              <p className="text-xs mt-1" style={{ color: '#DC3545' }}>{amountError}</p>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block mb-1 text-xs font-medium" style={{ color: '#6C757D' }}>Payment Method</label>
            <Select onValueChange={(v) => setMethod(v as typeof method)} defaultValue="cash">
              <SelectTrigger className="h-8 w-full text-xs border-[#E0E0E0]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Split Payment button */}
          {sale.customerId && (
            <button
              type="button"
              onClick={() => setShowSplit(true)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium"
              style={{
                background: '#E3F2FD',
                border: '1px solid #90CAF9',
                color: '#1565C0',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <Split className="w-3.5 h-3.5" />
              Split Payment (Multiple Methods)
            </button>
          )}

        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" icon={HandCoins} loading={loading} onClick={handlePay}>
            Record Payment
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>

      {/* Split Payment Modal */}
      {showSplit && sale.customerId && (
        <SaleSplitPaymentModal
          sale={{
            id:                          sale.id,
            ref:                         sale.ref,
            totalAmount:                 sale.totalAmount,
            businessLoanDeductionAmount: sale.businessLoanDeductionAmount ?? '0',
            amountPaid:                  sale.amountPaid,
            customerId:                  sale.customerId,
          }}
          hasOutstandingBusinessLoan={hasOutstandingBusinessLoan}
          onClose={() => setShowSplit(false)}
          onSuccess={() => {
            setShowSplit(false)
            onSuccess()
          }}
        />
      )}
    </Dialog>
  )
}
