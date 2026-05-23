'use client'

import { useState } from 'react'
import { Loader2, Printer, RotateCcw, CheckCircle2 } from 'lucide-react'
import type { SelectedCustomer } from './Step1Customer'
import type { SelectedProduct } from './Step2Product'

interface Props {
  customer:    SelectedCustomer
  product:     SelectedProduct
  weight:      string
  photoR2Keys: string[]
  onNewOrder:  () => void
}

export default function Step5Review({ customer, product, weight, photoR2Keys, onNewOrder }: Props) {
  const [status, setStatus]         = useState<'idle' | 'creating' | 'printing' | 'done' | 'error'>('idle')
  const [orderId, setOrderId]       = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [errorMsg, setErrorMsg]     = useState('')

  async function handleGenerateAndPrint() {
    setStatus('creating')
    setErrorMsg('')

    try {
      // Create the order
      const res = await fetch('/api/scale/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customer.id, productId: product.id, weight, photoR2Keys }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to create order')
      }
      const order = await res.json()
      setOrderId(order.id)
      setOrderNumber(order.orderNumber)
      setStatus('printing')

      // Open the slip PDF in a new tab for browser print
      window.open(`/api/scale/orders/${order.id}/slip`, '_blank')
      setStatus('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  const formattedWeight = `${parseFloat(weight).toFixed(3)} ${product.unit}`

  return (
    <div className="flex-1 flex flex-col p-5 max-w-md mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Review & Print</h2>
      <p className="text-slate-500 mb-5">Confirm the details below, then generate the slip</p>

      {/* Summary card */}
      <div className="bg-white rounded-2xl shadow-md p-5 mb-5 flex flex-col gap-3">
        <Row label="Customer" value={`${customer.firstName} ${customer.lastName}`} />
        <Row label="Phone" value={customer.phone} />
        <div className="border-t border-slate-100" />
        <Row label="Category" value={product.categoryName} />
        <Row label="Product" value={product.name} />
        <div className="border-t border-slate-100" />
        <Row label="Weight" value={formattedWeight} large />
        <div className="border-t border-slate-100" />
        <Row label="Order #" value={orderNumber ?? '—  (generated on print)'} mono />
        <div className="mt-1 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-amber-700 text-xs font-medium text-center">NO PRICE ON THIS SLIP</p>
        </div>
      </div>

      {/* Photos count */}
      <p className="text-slate-500 text-sm mb-5 text-center">{photoR2Keys.length} photo{photoR2Keys.length !== 1 ? 's' : ''} attached</p>

      {status === 'done' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 mb-5">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Order created: {orderNumber}</p>
            <p className="text-emerald-600 text-sm">Slip opened in browser — use your print dialog to print</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5">
          <p className="text-red-700 text-sm">{errorMsg}</p>
        </div>
      )}

      {status !== 'done' && (
        <button
          onClick={handleGenerateAndPrint}
          disabled={status === 'creating' || status === 'printing'}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xl font-semibold h-16 rounded-xl flex items-center justify-center gap-3 transition-colors"
        >
          {(status === 'creating' || status === 'printing') ? (
            <><Loader2 className="w-6 h-6 animate-spin" /> {status === 'creating' ? 'Creating order...' : 'Opening slip...'}</>
          ) : (
            <><Printer className="w-6 h-6" /> Generate & Print Slip</>
          )}
        </button>
      )}

      {(status === 'done' || status === 'error') && (
        <button
          onClick={() => {
            if (orderId && status !== 'done') return
            window.open(`/api/scale/orders/${orderId}/slip`, '_blank')
          }}
          className="w-full mt-3 bg-slate-700 hover:bg-slate-800 text-white text-base font-semibold h-12 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Printer className="w-5 h-5" /> Reprint Slip
        </button>
      )}

      <button
        onClick={onNewOrder}
        className="w-full mt-3 border-2 border-slate-300 hover:border-emerald-500 text-slate-700 text-base font-semibold h-12 rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        <RotateCcw className="w-5 h-5" /> New Order
      </button>
    </div>
  )
}

function Row({ label, value, large, mono }: { label: string; value: string; large?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-slate-500 text-sm flex-shrink-0">{label}</span>
      <span className={`font-semibold text-slate-800 text-right ${large ? 'text-xl' : 'text-base'} ${mono ? 'font-mono tracking-wide' : ''}`}>
        {value}
      </span>
    </div>
  )
}
