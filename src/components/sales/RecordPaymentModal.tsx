'use client'

import { useState } from 'react'
import { Loader2, HandCoins } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog, DialogContent, ModalTitleBar } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

export type PayTarget = {
  id: string
  ref: string
  totalAmount: string
  amountPaid: string
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
  const [method,      setMethod]      = useState<'cash' | 'eft' | 'cheque'>('cash')
  const [amount,      setAmount]      = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)

  const totalAmount = new Decimal(sale.totalAmount)
  const alreadyPaid = new Decimal(sale.amountPaid)
  const remaining   = totalAmount.minus(alreadyPaid)

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
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <ModalTitleBar title="Record Payment" onClose={onClose} />
        <div className="space-y-4 mt-2">
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
              <SelectTrigger className="h-8 text-xs border-[#E0E0E0]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs font-medium border border-[#E0E0E0] bg-white disabled:opacity-50"
              style={{ color: '#212529' }}
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
              style={{ background: '#217346' }}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HandCoins className="w-3.5 h-3.5" />}
              Record Payment
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
