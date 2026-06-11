'use client'

import { useState, useEffect } from 'react'
import {
  Loader2,
  BluetoothSearching,
  Printer,
  CheckCircle2,
  RefreshCw,
  Wifi,
  AlertCircle,
} from 'lucide-react'
import { ConnectionType } from '@/lib/schemas/printer'
import {
  getPairedPrinters,
  startBluetoothScan,
  stopBluetoothScan,
  requestBluetoothPermissions,
  pairDevice,
  testNetworkConnection,
  type Printer as BTDevice,
  type DiscoveredDevice,
} from '@/lib/scale/capacitorPrint'

interface Props {
  connectionType: ConnectionType
  onSelect: (address: string, deviceType: 'classic' | 'ble') => void
  onBack: () => void
}

type BluetoothState = 'loading' | 'scanning' | 'idle' | 'error'

export default function StepDeviceSelection({ connectionType, onSelect, onBack }: Props) {
  // Bluetooth state
  const [btState, setBtState] = useState<BluetoothState>('loading')
  const [pairedDevices, setPairedDevices] = useState<BTDevice[]>([])
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([])
  const [scanError, setScanError] = useState<string | null>(null)

  // Network state
  const [ipAddress, setIpAddress] = useState('')
  const [port, setPort] = useState('9100')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null)

  // Load paired devices on mount (for Bluetooth)
  useEffect(() => {
    if (connectionType === 'network') return

    async function loadDevices() {
      setBtState('loading')
      const devices = await getPairedPrinters()
      setPairedDevices(devices)
      setBtState('idle')
    }
    loadDevices()
  }, [connectionType])

  async function handleScan() {
    setBtState('scanning')
    setScanError(null)
    setDiscoveredDevices([])

    // Request permissions first
    const { granted } = await requestBluetoothPermissions()
    if (!granted) {
      setScanError('Bluetooth permission required for scanning')
      setBtState('error')
      return
    }

    const result = await startBluetoothScan()
    if (result.error) {
      setScanError(result.error)
      setBtState('error')
    } else {
      setDiscoveredDevices(result.devices)
      setBtState('idle')
    }
  }

  async function handleStopScan() {
    await stopBluetoothScan()
    setBtState('idle')
  }

  async function handlePair(device: DiscoveredDevice) {
    const result = await pairDevice(device.address)
    if (result.success) {
      // Refresh paired devices
      const devices = await getPairedPrinters()
      setPairedDevices(devices)
      // Move device from discovered to paired
      setDiscoveredDevices(prev => prev.filter(d => d.address !== device.address))
    }
  }

  async function handleNetworkTest() {
    setTesting(true)
    setTestResult(null)

    const result = await testNetworkConnection(ipAddress, parseInt(port, 10))
    setTestResult(result)
    setTesting(false)
  }

  function handleNetworkSelect() {
    const address = `${ipAddress}:${port}`
    onSelect(address, 'classic') // Network printers use 'classic' type for now
  }

  // ── Network UI ─────────────────────────────────────────────────────────────
  if (connectionType === 'network') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-center mb-2">
          <h3 className="text-lg font-semibold text-slate-800">Enter Printer IP Address</h3>
          <p className="text-sm text-slate-500 mt-1">Connect to your network printer via TCP/IP</p>
        </div>

        <div className="bg-white rounded-2xl border-2 border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Wifi className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Network Printer</p>
              <p className="text-xs text-slate-500">TCP Port 9100 (standard)</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">IP Address</label>
              <input
                type="text"
                value={ipAddress}
                onChange={e => setIpAddress(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-400 focus:outline-none text-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
              <input
                type="text"
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="9100"
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-400 focus:outline-none text-lg font-mono"
              />
            </div>
          </div>

          {testResult && (
            <div className={`mt-4 p-3 rounded-xl ${testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.success ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Connected ({testResult.latencyMs}ms)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>{testResult.error}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleNetworkTest}
              disabled={!ipAddress || testing}
              className="flex-1 py-3 px-4 rounded-xl border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {testing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
              Test Connection
            </button>
            <button
              onClick={handleNetworkSelect}
              disabled={!testResult?.success}
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              Use This Printer
            </button>
          </div>
        </div>

        <button
          onClick={onBack}
          className="text-slate-500 hover:text-slate-700 text-sm font-medium"
        >
          &larr; Back to connection type
        </button>
      </div>
    )
  }

  // ── Bluetooth UI ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-slate-800">Select a Bluetooth Printer</h3>
        <p className="text-sm text-slate-500 mt-1">Choose from paired devices or scan for new ones</p>
      </div>

      {/* Paired Devices */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2 px-1">
          Paired Devices
        </p>
        {btState === 'loading' ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : pairedDevices.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">
            No paired printers found
          </div>
        ) : (
          <div className="space-y-2">
            {pairedDevices.map(device => (
              <button
                key={device.address}
                onClick={() => onSelect(device.address, device.type)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{device.name || 'Unknown device'}</p>
                  <p className="text-xs text-slate-400 font-mono">{device.address}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  device.type === 'ble' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {device.type === 'ble' ? 'BLE' : 'Classic'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scan Section */}
      <div className="border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
            Nearby Devices
          </p>
          {btState === 'scanning' ? (
            <button
              onClick={handleStopScan}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Stop Scan
            </button>
          ) : (
            <button
              onClick={handleScan}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <BluetoothSearching className="w-3 h-3" />
              Scan
            </button>
          )}
        </div>

        {btState === 'scanning' && (
          <div className="flex items-center justify-center gap-2 py-6 text-blue-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Scanning for devices...</span>
          </div>
        )}

        {btState === 'error' && scanError && (
          <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {scanError}
          </div>
        )}

        {btState === 'idle' && discoveredDevices.length > 0 && (
          <div className="space-y-2">
            {discoveredDevices.map(device => (
              <div
                key={device.address}
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                  <BluetoothSearching className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-slate-700 truncate">{device.name || 'Unknown device'}</p>
                  <p className="text-xs text-slate-400 font-mono">{device.address}</p>
                  {device.rssi && (
                    <p className="text-xs text-slate-400">Signal: {device.rssi} dBm</p>
                  )}
                </div>
                <button
                  onClick={() => handlePair(device)}
                  className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600"
                >
                  Pair
                </button>
              </div>
            ))}
          </div>
        )}

        {btState === 'idle' && discoveredDevices.length === 0 && (
          <div className="text-center py-4 text-slate-400 text-sm">
            Tap &quot;Scan&quot; to find nearby printers
          </div>
        )}
      </div>

      <button
        onClick={onBack}
        className="text-slate-500 hover:text-slate-700 text-sm font-medium mt-2"
      >
        &larr; Back to connection type
      </button>
    </div>
  )
}
