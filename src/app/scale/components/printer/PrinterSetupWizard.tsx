'use client'

import { useState, useEffect } from 'react'
import { X, Printer, Settings, Trash2 } from 'lucide-react'
import { ConnectionType, CreatePrinterConfig, PrinterConfig } from '@/lib/schemas/printer'
import { usePrinterStore, usePrinters, useDefaultPrinterId } from '@/stores/printerStore'
import { waitForCapacitor, getCapacitorDiagnostics, type CapacitorDiagnostics } from '@/lib/scale/capacitorPrint'
import StepConnectionType from './StepConnectionType'
import StepDeviceSelection from './StepDeviceSelection'
import StepConfiguration from './StepConfiguration'
import StepTestPrint from './StepTestPrint'

interface Props {
  open: boolean
  onClose: () => void
}

type WizardStep = 'list' | 'connection' | 'device' | 'config' | 'test'
type CapacitorState = 'checking' | 'available' | 'unavailable'

export default function PrinterSetupWizard({ open, onClose }: Props) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('list')
  const [capacitorState, setCapacitorState] = useState<CapacitorState>('checking')
  const [diagnostics, setDiagnostics] = useState<CapacitorDiagnostics | null>(null)

  // Config being built through wizard
  const [connectionType, setConnectionType] = useState<ConnectionType>('bluetooth')
  const [selectedAddress, setSelectedAddress] = useState('')
  const [deviceType, setDeviceType] = useState<'classic' | 'ble'>('classic')
  const [pendingConfig, setPendingConfig] = useState<PrinterConfig | null>(null)

  // Store
  const printers = usePrinters()
  const defaultPrinterId = useDefaultPrinterId()
  const { addPrinter, removePrinter, setDefault } = usePrinterStore()

  // Check Capacitor on open
  useEffect(() => {
    if (!open) return

    setCapacitorState('checking')
    setDiagnostics(null)

    async function check() {
      const available = await waitForCapacitor()
      setDiagnostics(getCapacitorDiagnostics())
      setCapacitorState(available ? 'available' : 'unavailable')
    }
    check()
  }, [open])

  // Reset wizard on close
  useEffect(() => {
    if (!open) {
      setStep('list')
      setConnectionType('bluetooth')
      setSelectedAddress('')
      setPendingConfig(null)
    }
  }, [open])

  function handleConnectionSelect(type: ConnectionType) {
    setConnectionType(type)
    setStep('device')
  }

  function handleDeviceSelect(address: string, type: 'classic' | 'ble') {
    setSelectedAddress(address)
    setDeviceType(type)
    setStep('config')
  }

  function handleConfigSave(config: CreatePrinterConfig) {
    const newPrinter = addPrinter(config)
    setPendingConfig(newPrinter)
    setStep('test')
  }

  function handleTestDone() {
    onClose()
  }

  function handleDeletePrinter(id: string) {
    removePrinter(id)
  }

  function handleSetDefault(id: string) {
    setDefault(id)
  }

  if (!open) return null

  // ── Not Available ──────────────────────────────────────────────────────────
  if (capacitorState === 'unavailable') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
          <Header onClose={onClose} />
          <div className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
              <Printer className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Mobile App Only</h3>
            <p className="text-sm text-slate-500 mb-4">
              Printer setup is only available when running in the Scale Station Android app.
            </p>
            {diagnostics && (
              <div className="text-left bg-slate-100 rounded-lg p-3 text-xs font-mono">
                <p className={diagnostics.hasCapacitor ? 'text-green-600' : 'text-red-600'}>
                  Capacitor: {diagnostics.hasCapacitor ? '✓' : '✗'}
                </p>
                <p className={diagnostics.isNativePlatform ? 'text-green-600' : 'text-red-600'}>
                  Native Platform: {diagnostics.isNativePlatform ? '✓' : '✗'}
                </p>
                <p className={diagnostics.hasThermalPrinter ? 'text-green-600' : 'text-red-600'}>
                  ThermalPrinter: {diagnostics.hasThermalPrinter ? '✓' : '✗'}
                </p>
              </div>
            )}
          </div>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }} />
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (capacitorState === 'checking') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
          <Header onClose={onClose} />
          <div className="p-6 flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-500">Checking printer support...</p>
          </div>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }} />
        </div>
      </div>
    )
  }

  // ── Wizard Steps ───────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <Header onClose={onClose} />

        <div className="max-h-[70vh] overflow-y-auto">
          {/* Printer List */}
          {step === 'list' && (
            <div className="p-4">
              {printers.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                    <Printer className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">No Printers Configured</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Add a thermal printer to start printing receipts.
                  </p>
                  <button
                    onClick={() => setStep('connection')}
                    className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                  >
                    Add Printer
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold px-1">
                    Configured Printers
                  </p>
                  {printers.map(printer => (
                    <PrinterCard
                      key={printer.id}
                      printer={printer}
                      isDefault={printer.id === defaultPrinterId}
                      onSetDefault={() => handleSetDefault(printer.id)}
                      onDelete={() => handleDeletePrinter(printer.id)}
                    />
                  ))}
                  <button
                    onClick={() => setStep('connection')}
                    className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-medium hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                  >
                    + Add Another Printer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Connection Type */}
          {step === 'connection' && (
            <StepConnectionType onSelect={handleConnectionSelect} />
          )}

          {/* Step 2: Device Selection */}
          {step === 'device' && (
            <StepDeviceSelection
              connectionType={connectionType}
              onSelect={handleDeviceSelect}
              onBack={() => setStep('connection')}
            />
          )}

          {/* Step 3: Configuration */}
          {step === 'config' && (
            <StepConfiguration
              address={selectedAddress}
              deviceType={deviceType}
              connectionType={connectionType}
              onSave={handleConfigSave}
              onBack={() => setStep('device')}
            />
          )}

          {/* Step 4: Test Print */}
          {step === 'test' && pendingConfig && (
            <StepTestPrint
              config={pendingConfig}
              onDone={handleTestDone}
              onBack={() => setStep('config')}
            />
          )}
        </div>

        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }} />
      </div>
    </div>
  )
}

// ── Header Component ─────────────────────────────────────────────────────────
function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-emerald-600" />
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
  )
}

// ── Printer Card Component ───────────────────────────────────────────────────
interface PrinterCardProps {
  printer: PrinterConfig
  isDefault: boolean
  onSetDefault: () => void
  onDelete: () => void
}

function PrinterCard({ printer, isDefault, onSetDefault, onDelete }: PrinterCardProps) {
  return (
    <div className={`rounded-2xl border-2 p-4 ${isDefault ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDefault ? 'bg-emerald-200' : 'bg-slate-100'}`}>
          <Printer className={`w-5 h-5 ${isDefault ? 'text-emerald-700' : 'text-slate-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-800 truncate">{printer.label}</p>
            {isDefault && (
              <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Default</span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono truncate">{printer.address}</p>
          <div className="flex gap-3 mt-1 text-xs text-slate-400">
            <span>{printer.connectionType}</span>
            <span>{printer.paperWidth}</span>
            <span>Density: {printer.density}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
        {!isDefault && (
          <button
            onClick={onSetDefault}
            className="flex-1 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
          >
            Set as Default
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-1 py-2 px-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Remove
        </button>
      </div>
    </div>
  )
}
