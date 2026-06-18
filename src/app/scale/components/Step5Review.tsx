'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Printer, RotateCcw, CheckCircle2, Trash2, AlertCircle, Download, WifiOff, Cloud, X, Check, Pencil } from 'lucide-react'
import type { SelectedCustomer } from './Step1Customer'
import type { CartLine } from './Step5LineAdded'
import { buildReceipt }         from '@/lib/scale/thermalReceipt'
import {
  waitForCapacitor,
  getSavedPrinterAddress,
  printBytes,
} from '@/lib/scale/capacitorPrint'
import { usePrinterSetup } from '../PrinterContext'
import { useOfflineStore } from '@/stores/offlineStore'
import { createOfflineScaleOrder } from '@/lib/offline/scaleOrderService'
import { useSession } from 'next-auth/react'

interface Props {
  customer:     SelectedCustomer
  cart:         CartLine[]
  onRemoveLine: (index: number) => void
  onUpdateLine: (index: number, updates: Partial<CartLine>) => void
  onNewOrder:   () => void
}

type Status = 'idle' | 'creating' | 'printing' | 'done' | 'error' | 'no-printer'

export default function Step5Review({ customer, cart, onRemoveLine, onUpdateLine, onNewOrder }: Props) {
  const { openPrinterSetup } = usePrinterSetup()
  const { isOnline } = useOfflineStore()
  const { data: session } = useSession()
  const [status,      setStatus]      = useState<Status>('idle')
  const [orderId,     setOrderId]     = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [isOfflineOrder, setIsOfflineOrder] = useState(false)
  const [errorMsg,    setErrorMsg]    = useState('')

  // Inline weight edit state
  const [editingWeightIndex, setEditingWeightIndex] = useState<number | null>(null)
  const [editWeight, setEditWeight] = useState('')
  const [editError, setEditError] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Cached receipt bytes so "Reprint" doesn't rebuild from potentially stale state
  const receiptRef = useRef<Uint8Array | null>(null)

  // Wait for Capacitor bridge - important for tablets where bridge may not be ready immediately
  const [inCapacitor, setInCapacitor] = useState(false)
  useEffect(() => { waitForCapacitor().then(setInCapacitor) }, [])

  async function doPrint(bytes: Uint8Array) {
    setStatus('printing')
    await printBytes(bytes)
  }

  async function handleGenerateAndPrint() {
    setStatus('creating')
    setErrorMsg('')
    setIsOfflineOrder(false)

    try {
      let finalOrderId: string
      let finalOrderNumber: string

      if (isOnline) {
        // ── Online: Create via API ──────────────────────────────────────────
        const lines = cart.map(item => ({
          productId:   item.productId,
          weight:      item.weight,
          photoR2Keys: item.photoR2Keys,
        }))

        const payload = customer.id
          ? { customerId: customer.id, lines }
          : {
              casualFirstName: customer.firstName,
              casualLastName:  customer.lastName,
              casualPhone:     customer.phone,
              casualIdNumber:  customer.idNumber,
              casualAddress:   customer.address,
              lines,
            }

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
        finalOrderId = order.id
        finalOrderNumber = order.orderNumber
      } else {
        // ── Offline: Create locally ─────────────────────────────────────────
        const result = await createOfflineScaleOrder({
          customerId: customer.id,
          casualFirstName: customer.id ? null : customer.firstName,
          casualLastName: customer.id ? null : customer.lastName,
          casualPhone: customer.id ? null : customer.phone,
          casualIdNumber: customer.id ? null : (customer.idNumber ?? null),
          lines: cart.map(item => ({
            productId:    item.productId,
            productName:  item.productName,
            categoryName: item.categoryName,
            weight:       item.weight,
            unit:         item.unit,
            photoBlobs:   item.photoBlobs ?? [],
          })),
          notes: null,
          operatorId: session?.user?.id ?? 'unknown',
        })
        finalOrderId = result.id
        finalOrderNumber = result.tempOrderNumber
        setIsOfflineOrder(true)
      }

      setOrderId(finalOrderId)
      setOrderNumber(finalOrderNumber)

      // ── Print path ────────────────────────────────────────────────────────
      if (inCapacitor) {
        if (!getSavedPrinterAddress()) {
          setStatus('no-printer')
          return
        }

        const bytes = buildReceipt({
          orderNumber: finalOrderNumber,
          createdAt:   new Date().toISOString(),
          customer: {
            firstName: customer.firstName,
            lastName:  customer.lastName,
            phone:     customer.phone,
            idNumber:  customer.idNumber,
            isAccount: !!customer.id,
          },
          lines: cart.map(l => ({
            productName:  l.productName,
            categoryName: l.categoryName,
            weight:       l.weight,
            unit:         l.unit,
          })),
          isOffline: !isOnline,
        })
        receiptRef.current = bytes
        await doPrint(bytes)
        setStatus('done')
      } else {
        // Browser fallback
        setStatus('done')
        if (isOnline) {
          // Download PDF slip only when online
          setTimeout(() => {
            const a = document.createElement('a')
            a.href = `/api/scale/orders/${finalOrderId}/slip`
            a.download = `scale-order-${finalOrderNumber}.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
          }, 100)
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  async function handleReprint() {
    if (!receiptRef.current) return
    setErrorMsg('')
    try {
      await doPrint(receiptRef.current)
      setStatus('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Print failed')
      setStatus('error')
    }
  }

  // Download PDF slip - works in Capacitor WebView where target="_blank" doesn't
  async function handleDownloadSlip() {
    if (!orderId) return
    try {
      const res = await fetch(`/api/scale/orders/${orderId}/slip`)
      if (!res.ok) throw new Error('Failed to fetch slip')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      // Create a temporary link and click it to trigger download
      const a = document.createElement('a')
      a.href = url
      a.download = `scale-order-${orderNumber || orderId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to download slip')
    }
  }

  const busy = status === 'creating' || status === 'printing'

  // ── Inline weight edit functions ─────────────────────────────────────────
  function openWeightEdit(index: number, currentWeight: string | null) {
    setEditingWeightIndex(index)
    setEditWeight(currentWeight ?? '')
    setEditError('')
    // Focus input after render
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  function handleWeightInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    // Allow digits, one decimal point, max 3 decimals
    if (/^\d*\.?\d{0,3}$/.test(v)) {
      setEditWeight(v)
      setEditError('')
    }
  }

  function cancelWeightEdit() {
    setEditingWeightIndex(null)
    setEditWeight('')
    setEditError('')
  }

  function saveWeightEdit() {
    if (editingWeightIndex === null) return

    const num = parseFloat(editWeight)
    if (!editWeight || isNaN(num) || num <= 0) {
      setEditError('Enter a valid weight greater than 0')
      return
    }

    onUpdateLine(editingWeightIndex, { weight: editWeight })
    setEditingWeightIndex(null)
    setEditWeight('')
    setEditError('')
  }

  function handleWeightKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveWeightEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelWeightEdit()
    }
  }

  return (
    <div className="flex-1 flex flex-col p-5 max-w-md mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Review &amp; Print</h2>
      <p className="text-slate-500 mb-5">Confirm the details below, then generate the slip</p>

      {/* Customer summary */}
      <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Customer</p>
        <p className="font-semibold text-slate-800">{customer.firstName} {customer.lastName}</p>
        <p className="text-slate-500 text-sm">{customer.phone}</p>
      </div>

      {/* Cart */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-4">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {cart.length} product{cart.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {cart.map((item, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">{item.productName}</p>
                  <p className="text-xs text-slate-400">{item.categoryName}</p>
                </div>

                {/* Weight display or inline edit */}
                {editingWeightIndex === i ? (
                  <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1.5 border border-emerald-300">
                    <button
                      type="button"
                      onClick={() => setEditWeight('')}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
                      aria-label="Clear"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <input
                      ref={editInputRef}
                      type="number"
                      inputMode="decimal"
                      value={editWeight}
                      onChange={handleWeightInputChange}
                      onKeyDown={handleWeightKeyDown}
                      className="w-16 text-sm font-semibold text-right bg-transparent border-none focus:outline-none font-mono"
                      placeholder="0.00"
                    />
                    <span className="text-xs font-medium text-slate-500">{item.unit}</span>
                    <button
                      type="button"
                      onClick={saveWeightEdit}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 rounded-md transition-colors"
                      aria-label="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : item.weight ? (
                  status === 'idle' ? (
                    <button
                      onClick={() => openWeightEdit(i, item.weight)}
                      className="flex items-center gap-1.5 font-semibold text-slate-700 text-sm font-mono shrink-0 hover:text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors group"
                    >
                      {parseFloat(item.weight).toFixed(2)} {item.unit}
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <span className="font-semibold text-slate-700 text-sm font-mono shrink-0">
                      {parseFloat(item.weight).toFixed(2)} {item.unit}
                    </span>
                  )
                ) : status === 'idle' ? (
                  <button
                    onClick={() => openWeightEdit(i, null)}
                    className="text-xs text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    + Add weight
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}

                {status === 'idle' && cart.length > 1 && editingWeightIndex !== i && (
                  <button
                    onClick={() => onRemoveLine(i)}
                    className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label={`Remove ${item.productName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Error message when editing this row */}
              {editingWeightIndex === i && editError && (
                <p className="text-red-500 text-xs mt-2 ml-1">{editError}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* No-price warning + order number */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
        <p className="text-amber-700 text-xs font-medium text-center">NO PRICE ON THIS SLIP</p>
        {orderNumber && (
          <p className="text-amber-700 text-xs text-center mt-1">Order: {orderNumber}</p>
        )}
      </div>

      {/* ── Status banners ─────────────────────────────────────────────────── */}

      {/* Success */}
      {status === 'done' && (
        <div className={`rounded-2xl p-4 flex items-center gap-3 mb-4 ${isOfflineOrder ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          {isOfflineOrder ? (
            <Cloud className="w-6 h-6 text-amber-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          )}
          <div>
            <p className={`font-semibold ${isOfflineOrder ? 'text-amber-800' : 'text-emerald-800'}`}>
              {isOfflineOrder
                ? `Order saved locally: ${orderNumber}`
                : inCapacitor
                  ? `Receipt printed: ${orderNumber}`
                  : `Order created: ${orderNumber}`
              }
            </p>
            <p className={`text-sm ${isOfflineOrder ? 'text-amber-600' : 'text-emerald-600'}`}>
              {isOfflineOrder
                ? 'Will sync automatically when back online'
                : inCapacitor
                  ? 'Slip sent to printer'
                  : 'Slip opened — use your print dialog to print'
              }
            </p>
          </div>
        </div>
      )}

      {/* No printer configured */}
      {status === 'no-printer' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">No printer configured</p>
            <p className="text-amber-700 text-sm mb-2">Order {orderNumber} was saved. Set up your printer then reprint.</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={openPrinterSetup}
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
              >
                Set up printer →
              </button>
              {orderId && (
                <button
                  onClick={handleDownloadSlip}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2 flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Download Slip (PDF)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <p className="text-red-700 text-sm font-medium">
            {errorMsg || 'Something went wrong'}
          </p>
        </div>
      )}

      {/* ── Action buttons ──────────────────────────────────────────────────── */}

      {/* Offline indicator */}
      {!isOnline && status === 'idle' && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-amber-700 text-sm">Offline — order will be saved locally and synced when back online</span>
        </div>
      )}

      {/* Main CTA — hidden once order is done or no-printer (order already saved) */}
      {status !== 'done' && status !== 'no-printer' && (
        <button
          onClick={handleGenerateAndPrint}
          disabled={cart.length === 0 || busy}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xl font-semibold h-16 rounded-xl flex items-center justify-center gap-3 transition-colors"
        >
          {status === 'creating' ? (
            <><Loader2 className="w-6 h-6 animate-spin" /> {isOnline ? 'Creating order…' : 'Saving locally…'}</>
          ) : status === 'printing' ? (
            <><Loader2 className="w-6 h-6 animate-spin" /> Sending to printer…</>
          ) : isOnline ? (
            <><Printer className="w-6 h-6" /> Generate &amp; Print Slip</>
          ) : (
            <><Printer className="w-6 h-6" /> Save &amp; Print (Offline)</>
          )}
        </button>
      )}

      {/* Retry print (after error) */}
      {status === 'error' && receiptRef.current && inCapacitor && (
        <button
          onClick={handleReprint}
          className="w-full mt-3 bg-slate-700 hover:bg-slate-800 text-white text-base font-semibold h-12 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Printer className="w-5 h-5" /> Retry Print
        </button>
      )}

      {/* Reprint (after success) */}
      {status === 'done' && orderId && (
        <button
          onClick={inCapacitor && receiptRef.current ? handleReprint : handleDownloadSlip}
          className="w-full mt-3 bg-slate-700 hover:bg-slate-800 text-white text-base font-semibold h-12 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Printer className="w-5 h-5" /> {inCapacitor && receiptRef.current ? 'Reprint Slip' : 'Download Slip'}
        </button>
      )}

      {/* Reprint from no-printer state (after user sets up printer) */}
      {status === 'no-printer' && receiptRef.current && (
        <button
          onClick={handleReprint}
          className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold h-12 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Printer className="w-5 h-5" /> Print Now
        </button>
      )}

      {/* New order */}
      <button
        onClick={onNewOrder}
        className="w-full mt-3 border-2 border-slate-300 hover:border-emerald-500 text-slate-700 text-base font-semibold h-12 rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        <RotateCcw className="w-5 h-5" /> New Order
      </button>
    </div>
  )
}
