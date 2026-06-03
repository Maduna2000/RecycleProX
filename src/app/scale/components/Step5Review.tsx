'use client'

import { useState } from 'react'
import { Loader2, Printer, RotateCcw, CheckCircle2, Trash2 } from 'lucide-react'
import type { SelectedCustomer } from './Step1Customer'
import type { CartLine } from './Step5LineAdded'

interface Props {
  customer:    SelectedCustomer
  cart:        CartLine[]
  onRemoveLine:(index: number) => void
  onNewOrder:  () => void
}

export default function Step5Review({ customer, cart, onRemoveLine, onNewOrder }: Props) {
  const [status, setStatus]           = useState<'idle' | 'creating' | 'printing' | 'done' | 'error'>('idle')
  const [orderId, setOrderId]         = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [errorMsg, setErrorMsg]       = useState('')

  async function handleGenerateAndPrint() {
    setStatus('creating')
    setErrorMsg('')

    try {
      const lines = cart.map(item => ({
        productId:   item.productId,
        weight:      item.weight,
        photoR2Keys: item.photoR2Keys,
      }))

      const payload = customer.id
        ? { customerId: customer.id, lines }
        : { casualFirstName: customer.firstName, casualLastName: customer.lastName, casualPhone: customer.phone, casualIdNumber: customer.idNumber, lines }

      const res = await fetch('/api/scale/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to create order')
      }
      const order = await res.json()
      setOrderId(order.id)
      setOrderNumber(order.orderNumber)
      setStatus('printing')

      window.open(`/api/scale/orders/${order.id}/slip`, '_blank')
      setStatus('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  const canSubmit = cart.length > 0

  return (
    <div className="flex-1 flex flex-col p-5 max-w-md mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Review & Print</h2>
      <p className="text-slate-500 mb-5">Confirm the details below, then generate the slip</p>

      {/* Customer summary */}
      <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Customer</p>
        <p className="font-semibold text-slate-800">{customer.firstName} {customer.lastName}</p>
        <p className="text-slate-500 text-sm">{customer.phone}</p>
      </div>

      {/* Cart table */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-4">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {cart.length} product{cart.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {cart.map((item, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm truncate">{item.productName}</p>
                <p className="text-xs text-slate-400">{item.categoryName}</p>
              </div>
              <span className="font-semibold text-slate-700 text-sm font-mono shrink-0">
                {parseFloat(item.weight).toFixed(3)} {item.unit}
              </span>
              {status === 'idle' && cart.length > 1 && (
                <button
                  onClick={() => onRemoveLine(i)}
                  className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
        <p className="text-amber-700 text-xs font-medium text-center">NO PRICE ON THIS SLIP</p>
        {orderNumber && (
          <p className="text-amber-700 text-xs text-center mt-1">Order: {orderNumber}</p>
        )}
      </div>

      {status === 'done' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 mb-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Order created: {orderNumber}</p>
            <p className="text-emerald-600 text-sm">Slip opened — use your print dialog to print</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <p className="text-red-700 text-sm">{errorMsg}</p>
        </div>
      )}

      {status !== 'done' && (
        <button
          onClick={handleGenerateAndPrint}
          disabled={!canSubmit || status === 'creating' || status === 'printing'}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xl font-semibold h-16 rounded-xl flex items-center justify-center gap-3 transition-colors"
        >
          {(status === 'creating' || status === 'printing') ? (
            <><Loader2 className="w-6 h-6 animate-spin" /> {status === 'creating' ? 'Creating order...' : 'Opening slip...'}</>
          ) : (
            <><Printer className="w-6 h-6" /> Generate & Print Slip</>
          )}
        </button>
      )}

      {(status === 'done' || status === 'error') && orderId && (
        <button
          onClick={() => window.open(`/api/scale/orders/${orderId}/slip`, '_blank')}
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
