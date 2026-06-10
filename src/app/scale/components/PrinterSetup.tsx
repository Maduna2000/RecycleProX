'use client'

import { useEffect, useState } from 'react'
import { X, Printer, CheckCircle2, Loader2, BluetoothSearching, Smartphone, Bug } from 'lucide-react'
import {
  waitForCapacitor,
  getPairedPrinters,
  getSavedPrinterAddress,
  savePrinterAddress,
  clearSavedPrinterAddress,
  getCapacitorDiagnostics,
  type Printer as BTDevice,
  type CapacitorDiagnostics,
} from '@/lib/scale/capacitorPrint'

interface Props {
  open:    boolean
  onClose: () => void
}

type State = 'not-in-app' | 'scanning' | 'list' | 'none'

export default function PrinterSetup({ open, onClose }: Props) {
  const [uiState,   setUiState]   = useState<State>('scanning')
  const [printers,  setPrinters]  = useState<BTDevice[]>([])
  const [selected,  setSelected]  = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<CapacitorDiagnostics | null>(null)
  const [showDiag, setShowDiag] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setUiState('scanning')
    setDiagnostics(null)

    // Wait for Capacitor with retries - important for tablets where
    // the bridge can take longer to initialize (can take 10+ seconds on some devices)
    async function initPrinterSetup() {
      const isAvailable = await waitForCapacitor() // Uses default 8 attempts, 200ms initial delay

      if (cancelled) return

      // Always capture diagnostics for debugging
      const diag = getCapacitorDiagnostics()
      setDiagnostics(diag)

      if (!isAvailable) {
        // Log diagnostics for debugging tablet issues
        console.warn('[PrinterSetup] Capacitor not available:', diag)
        setUiState('not-in-app')
        return
      }

      setSelected(getSavedPrinterAddress())

      const list = await getPairedPrinters()
      if (cancelled) return

      setPrinters(list)
      setUiState(list.length > 0 ? 'list' : 'none')
    }

    initPrinterSetup()

    return () => { cancelled = true }
  }, [open])

  function handleSelect(address: string) {
    savePrinterAddress(address)
    setSelected(address)
  }

  function handleClear() {
    clearSavedPrinterAddress()
    setSelected(null)
  }

  if (!open) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Sheet */}
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">

        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">Printer Setup</h2>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">

          {/* Not in Capacitor */}
          {uiState === 'not-in-app' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Smartphone className="w-12 h-12 text-slate-300" />
              <p className="font-semibold text-slate-700">Mobile app only</p>
              <p className="text-sm text-slate-400">
                Printer setup is only available in the Scale Station Android app.
              </p>
              {/* Debug button to show diagnostics */}
              <button
                onClick={() => setShowDiag(!showDiag)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <Bug className="w-3 h-3" />
                {showDiag ? 'Hide' : 'Show'} Debug Info
              </button>
              {showDiag && diagnostics && (
                <div className="mt-2 text-left bg-slate-100 rounded-lg p-3 text-xs font-mono w-full max-w-sm">
                  <p className={diagnostics.hasCapacitor ? 'text-green-600' : 'text-red-600'}>
                    Capacitor: {diagnostics.hasCapacitor ? '✓' : '✗'}
                  </p>
                  <p className={diagnostics.isNativePlatform ? 'text-green-600' : 'text-red-600'}>
                    isNativePlatform: {diagnostics.isNativePlatform ? '✓' : '✗'}
                  </p>
                  <p className={diagnostics.hasThermalPrinter ? 'text-green-600' : 'text-red-600'}>
                    ThermalPrinter: {diagnostics.hasThermalPrinter ? '✓' : '✗'}
                  </p>
                  <p className="text-slate-500 mt-1 break-all">
                    Screen: {diagnostics.screenWidth}×{diagnostics.screenHeight}
                  </p>
                  <p className="text-slate-500 break-all" style={{ fontSize: '10px' }}>
                    UA: {diagnostics.userAgent}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Scanning */}
          {uiState === 'scanning' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-slate-500 text-sm">Scanning for paired printers…</p>
            </div>
          )}

          {/* No printers found */}
          {uiState === 'none' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <BluetoothSearching className="w-12 h-12 text-slate-300" />
              <p className="font-semibold text-slate-700">No paired printers found</p>
              <p className="text-sm text-slate-400">
                Pair your Bluetooth thermal printer in Android Settings → Bluetooth first, then come back here.
              </p>
            </div>
          )}

          {/* Printer list */}
          {uiState === 'list' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">
                Paired devices
              </p>
              {printers.map(printer => {
                const isActive = selected === printer.address
                return (
                  <button
                    key={printer.address}
                    onClick={() => handleSelect(printer.address)}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all active:scale-95 ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <Printer className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{printer.name || 'Unknown device'}</p>
                      <p className="text-xs text-slate-400 font-mono">{printer.address}</p>
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        printer.type === 'ble'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {printer.type === 'ble' ? 'Bluetooth LE' : 'Classic BT'}
                      </span>
                    </div>
                    {isActive && <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />}
                  </button>
                )
              })}

              {selected && (
                <button
                  onClick={handleClear}
                  className="mt-1 text-sm text-red-500 hover:text-red-700 min-h-[44px] flex items-center justify-center rounded-xl hover:bg-red-50 transition-colors"
                >
                  Clear printer selection
                </button>
              )}
            </div>
          )}
        </div>

        {/* Safe area bottom padding */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }} />
      </div>
    </div>
  )
}
