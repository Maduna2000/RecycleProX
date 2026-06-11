'use client'

import { useEffect, useState } from 'react'
import {
  X,
  Printer,
  CheckCircle2,
  Loader2,
  Smartphone,
  Bug,
  Wifi,
  Bluetooth,
  ChevronDown,
  RotateCcw,
  Settings,
  AlertCircle,
} from 'lucide-react'
import {
  waitForCapacitor,
  getPairedPrinters,
  getCapacitorDiagnostics,
  sendTestPrint,
  testNetworkConnection,
  requestBluetoothPermissions,
  startBluetoothScan,
  type Printer as BTDevice,
  type CapacitorDiagnostics,
} from '@/lib/scale/capacitorPrint'
import { usePrinterStore } from '@/stores/printerStore'
import type { ConnectionType, PaperWidth } from '@/lib/schemas/printer'

interface Props {
  open: boolean
  onClose: () => void
}

type CapacitorState = 'checking' | 'available' | 'unavailable'

export default function PrinterSetup({ open, onClose }: Props) {
  // Capacitor state
  const [capacitorState, setCapacitorState] = useState<CapacitorState>('checking')
  const [diagnostics, setDiagnostics] = useState<CapacitorDiagnostics | null>(null)
  const [showDiag, setShowDiag] = useState(false)

  // Device lists
  const [pairedDevices, setPairedDevices] = useState<BTDevice[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [loadingDevices, setLoadingDevices] = useState(true)

  // Form state
  const [connectionType, setConnectionType] = useState<ConnectionType>('bluetooth')
  const [selectedAddress, setSelectedAddress] = useState('')
  const [networkIp, setNetworkIp] = useState('')
  const [networkPort, setNetworkPort] = useState('9100')
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('58mm')
  const [density, setDensity] = useState(4)
  const [autoCut, setAutoCut] = useState(true)
  const [printerLabel, setPrinterLabel] = useState('')

  // Test print state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  // Store
  const { printers, defaultPrinterId, addPrinter, updatePrinter, removePrinter, setDefault } = usePrinterStore()

  // Load settings on open
  useEffect(() => {
    if (!open) return

    setCapacitorState('checking')
    setDiagnostics(null)
    setTestResult(null)

    async function init() {
      const isAvailable = await waitForCapacitor()
      const diag = getCapacitorDiagnostics()
      setDiagnostics(diag)
      setCapacitorState(isAvailable ? 'available' : 'unavailable')

      if (isAvailable) {
        // Load paired devices
        setLoadingDevices(true)
        const devices = await getPairedPrinters()
        setPairedDevices(devices)
        setLoadingDevices(false)

        // Load saved settings from default printer
        const defaultPrinter = printers.find(p => p.id === defaultPrinterId)
        if (defaultPrinter) {
          setConnectionType(defaultPrinter.connectionType)
          setSelectedAddress(defaultPrinter.address)
          setPaperWidth(defaultPrinter.paperWidth)
          setDensity(defaultPrinter.density)
          setAutoCut(defaultPrinter.autoCut)
          setPrinterLabel(defaultPrinter.label)

          // Parse network address if needed
          if (defaultPrinter.connectionType === 'network') {
            const parts = defaultPrinter.address.split(':')
            setNetworkIp(parts[0] || '')
            setNetworkPort(parts[1] || '9100')
          }
        }
      }
    }

    init()
  }, [open, printers, defaultPrinterId])

  // Scan for devices
  async function handleScan() {
    setIsScanning(true)
    await requestBluetoothPermissions()
    const result = await startBluetoothScan()
    // Merge with paired devices (discovered devices that are paired)
    const devices = await getPairedPrinters()
    setPairedDevices(devices)
    setIsScanning(false)
  }

  // Test print
  async function handleTestPrint() {
    setTesting(true)
    setTestResult(null)

    const address = connectionType === 'network'
      ? `${networkIp}:${networkPort}`
      : selectedAddress

    if (!address) {
      setTestResult({ success: false, error: 'No printer selected' })
      setTesting(false)
      return
    }

    // Test network connection first if network printer
    if (connectionType === 'network') {
      const netTest = await testNetworkConnection(networkIp, parseInt(networkPort, 10))
      if (!netTest.success) {
        setTestResult({ success: false, error: netTest.error || 'Connection failed' })
        setTesting(false)
        return
      }
    }

    const result = await sendTestPrint(connectionType, address, paperWidth)
    setTestResult(result)
    setTesting(false)
  }

  // Save settings
  function handleSave() {
    const address = connectionType === 'network'
      ? `${networkIp}:${networkPort}`
      : selectedAddress

    if (!address) return

    // Find existing printer with same address or create new
    const existing = printers.find(p => p.address === address)

    if (existing) {
      updatePrinter(existing.id, {
        label: printerLabel || `Printer ${address.slice(-5)}`,
        connectionType,
        paperWidth,
        density,
        autoCut,
      })
      setDefault(existing.id)
    } else {
      const newPrinter = addPrinter({
        label: printerLabel || `Printer ${address.slice(-5)}`,
        connectionType,
        address,
        paperWidth,
        density,
        autoCut,
        isDefault: true,
      })
      setDefault(newPrinter.id)
    }

    onClose()
  }

  // Get device type for selected address
  function getDeviceType(): 'classic' | 'ble' {
    const device = pairedDevices.find(d => d.address === selectedAddress)
    return device?.type || 'classic'
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">Printer Settings</h2>
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
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {/* Checking Capacitor */}
          {capacitorState === 'checking' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-slate-500 text-sm">Checking printer support...</p>
            </div>
          )}

          {/* Not in Capacitor */}
          {capacitorState === 'unavailable' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Smartphone className="w-12 h-12 text-slate-300" />
              <p className="font-semibold text-slate-700">Mobile app only</p>
              <p className="text-sm text-slate-400">
                Printer setup is only available in the Scale Station Android app.
              </p>
              <button
                onClick={() => setShowDiag(!showDiag)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <Bug className="w-3 h-3" />
                {showDiag ? 'Hide' : 'Show'} Debug Info
              </button>
              {showDiag && diagnostics && (
                <div className="mt-2 text-left bg-slate-100 rounded-lg p-3 text-xs font-mono w-full">
                  <p className={diagnostics.hasCapacitor ? 'text-green-600' : 'text-red-600'}>
                    Capacitor: {diagnostics.hasCapacitor ? 'Yes' : 'No'}
                  </p>
                  <p className={diagnostics.isNativePlatform ? 'text-green-600' : 'text-red-600'}>
                    Native: {diagnostics.isNativePlatform ? 'Yes' : 'No'}
                  </p>
                  <p className={diagnostics.hasThermalPrinter ? 'text-green-600' : 'text-red-600'}>
                    Plugin: {diagnostics.hasThermalPrinter ? 'Yes' : 'No'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Settings Form */}
          {capacitorState === 'available' && (
            <div className="space-y-5">
              {/* Connection Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Connection Type
                </label>
                <div className="relative">
                  <select
                    value={connectionType}
                    onChange={e => {
                      setConnectionType(e.target.value as ConnectionType)
                      setSelectedAddress('')
                      setTestResult(null)
                    }}
                    className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border-2 border-slate-200 bg-white focus:border-emerald-400 focus:outline-none text-slate-800"
                  >
                    <option value="bluetooth">Bluetooth Classic</option>
                    <option value="ble">Bluetooth LE (BLE)</option>
                    <option value="network">Network / WiFi</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Device Selection - Bluetooth */}
              {(connectionType === 'bluetooth' || connectionType === 'ble') && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700">
                      Select Printer
                    </label>
                    <button
                      onClick={handleScan}
                      disabled={isScanning}
                      className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      {isScanning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      Refresh
                    </button>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedAddress}
                      onChange={e => {
                        setSelectedAddress(e.target.value)
                        setTestResult(null)
                      }}
                      disabled={loadingDevices}
                      className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border-2 border-slate-200 bg-white focus:border-emerald-400 focus:outline-none text-slate-800 disabled:bg-slate-100"
                    >
                      <option value="">-- Select a printer --</option>
                      {pairedDevices
                        .filter(d => connectionType === 'ble' ? d.type === 'ble' : d.type === 'classic')
                        .map(device => (
                          <option key={device.address} value={device.address}>
                            {device.name || 'Unknown'} ({device.address})
                          </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  </div>
                  {pairedDevices.length === 0 && !loadingDevices && (
                    <p className="text-xs text-slate-400 mt-2">
                      No paired printers found. Pair your printer in Android Bluetooth settings first.
                    </p>
                  )}
                </div>
              )}

              {/* Network Settings */}
              {connectionType === 'network' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      IP Address
                    </label>
                    <input
                      type="text"
                      value={networkIp}
                      onChange={e => {
                        setNetworkIp(e.target.value)
                        setTestResult(null)
                      }}
                      placeholder="192.168.1.100"
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-400 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Port
                    </label>
                    <input
                      type="text"
                      value={networkPort}
                      onChange={e => {
                        setNetworkPort(e.target.value)
                        setTestResult(null)
                      }}
                      placeholder="9100"
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-400 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Printer Label */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Printer Name (optional)
                </label>
                <input
                  type="text"
                  value={printerLabel}
                  onChange={e => setPrinterLabel(e.target.value)}
                  placeholder="e.g., Front Counter"
                  maxLength={32}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-400 focus:outline-none"
                />
              </div>

              {/* Paper Width */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Paper Width
                </label>
                <div className="relative">
                  <select
                    value={paperWidth}
                    onChange={e => setPaperWidth(e.target.value as PaperWidth)}
                    className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border-2 border-slate-200 bg-white focus:border-emerald-400 focus:outline-none text-slate-800"
                  >
                    <option value="58mm">58mm (32 chars/line)</option>
                    <option value="80mm">80mm (48 chars/line)</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Print Density */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Print Density: {density}
                </label>
                <input
                  type="range"
                  min="0"
                  max="7"
                  value={density}
                  onChange={e => setDensity(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>Lighter</span>
                  <span>Darker</span>
                </div>
              </div>

              {/* Auto-Cut */}
              <div className="flex items-center justify-between p-4 rounded-xl border-2 border-slate-200">
                <div>
                  <p className="font-medium text-slate-700">Auto-Cut Paper</p>
                  <p className="text-xs text-slate-400">Cut paper after each print</p>
                </div>
                <button
                  onClick={() => setAutoCut(!autoCut)}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    autoCut ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      autoCut ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Test Print Result */}
              {testResult && (
                <div className={`p-4 rounded-xl flex items-center gap-3 ${
                  testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0" />
                  )}
                  <span className="text-sm">
                    {testResult.success ? 'Test print successful!' : testResult.error}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleTestPrint}
                  disabled={testing || (!selectedAddress && connectionType !== 'network') || (connectionType === 'network' && !networkIp)}
                  className="flex-1 py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Printer className="w-5 h-5" />
                  )}
                  Test Print
                </button>
                <button
                  onClick={handleSave}
                  disabled={(!selectedAddress && connectionType !== 'network') || (connectionType === 'network' && !networkIp)}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  Save Settings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Safe area padding */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }} />
      </div>
    </div>
  )
}
