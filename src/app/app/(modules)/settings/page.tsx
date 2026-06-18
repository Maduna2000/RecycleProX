'use client'

import { useState, useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save, Printer, RefreshCw, CheckCircle2, XCircle, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'
import { useOfflineStore } from '@/stores/offlineStore'
import { triggerSync, getPendingCount } from '@/lib/offline/sync'
import { runSeeder } from '@/lib/offline/seeder'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ScaleType   = 'none' | 'tcp' | 'serial'
type PrinterType = 'none' | 'serial' | 'tcp'

type SettingsMap = {
  yardName?: string; yardAddress?: string; yardPhone?: string
  vatNumber?: string; vatRate?: string; receiptFooter?: string
  defaultPin?: string
  printerType?: PrinterType; printerSerialPort?: string; printerBaudRate?: string
  printerIp?: string; printerTcpPort?: string
  scale1Type?: ScaleType; scale1Ip?: string; scale1Port?: string; scale1SerialPort?: string; scale1BaudRate?: string
  scale2Type?: ScaleType; scale2Ip?: string; scale2Port?: string; scale2SerialPort?: string; scale2BaudRate?: string
  scale3Type?: ScaleType; scale3Ip?: string; scale3Port?: string; scale3SerialPort?: string; scale3BaudRate?: string
}

const SCALE_NUMS = [1, 2, 3] as const
type ScaleNum = typeof SCALE_NUMS[number]

function scaleKey<T extends string>(n: ScaleNum, field: T) {
  return `scale${n}${field.charAt(0).toUpperCase() + field.slice(1)}` as keyof SettingsMap
}

// ─── Shared styles ─────────────────────────────────────────────────────────────
const sectionHdr: React.CSSProperties = {
  background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)',
  borderBottom: '1px solid #C0C0C0',
  padding: '4px 10px',
  flexShrink: 0,
}
const inp: React.CSSProperties = {
  height: 26, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 7px',
  fontSize: 12, color: '#212529', outline: 'none',
  background: '#fff', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 3,
}

function SHdr({ title }: { title: string }) {
  return (
    <div style={sectionHdr}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>{title}</span>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={lbl}>{label}</span>
      {children}
      {hint && <p style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{hint}</p>}
    </div>
  )
}

type SerialPortInfo = { path: string; manufacturer: string | null }

function ScaleRow({ n, form, set }: { n: ScaleNum; form: SettingsMap; set: (k: keyof SettingsMap, v: string) => void }) {
  const type = (form[scaleKey(n, 'type')] ?? 'none') as ScaleType
  return (
    <div style={{ borderTop: n > 1 ? '1px solid #E0E0E0' : undefined, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: type !== 'none' ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B', width: 52 }}>Scale {n}</span>
        <div style={{ width: 170 }}>
          <Select value={type} onValueChange={(v) => set(scaleKey(n, 'type'), v ?? '')}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not Connected</SelectItem>
              <SelectItem value="tcp">TCP / Network</SelectItem>
              <SelectItem value="serial">Serial / RS232</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {type === 'tcp' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingLeft: 60 }}>
          <Field label="IP Address">
            <input value={form[scaleKey(n, 'ip')] ?? ''} onChange={(e) => set(scaleKey(n, 'ip'), e.target.value)} placeholder="192.168.1.100" style={{ ...inp, fontFamily: 'monospace' }} />
          </Field>
          <Field label="Port">
            <input value={form[scaleKey(n, 'port')] ?? '8001'} onChange={(e) => set(scaleKey(n, 'port'), e.target.value)} placeholder="8001" style={{ ...inp, fontFamily: 'monospace' }} />
          </Field>
        </div>
      )}
      {type === 'serial' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingLeft: 60 }}>
          <Field label="Serial Port">
            <input value={form[scaleKey(n, 'serialPort')] ?? ''} onChange={(e) => set(scaleKey(n, 'serialPort'), e.target.value)} placeholder="COM3 or /dev/ttyUSB0" style={{ ...inp, fontFamily: 'monospace' }} />
          </Field>
          <Field label="Baud Rate">
            <Select value={form[scaleKey(n, 'baudRate')] ?? '9600'} onValueChange={(v) => set(scaleKey(n, 'baudRate'), v ?? '')}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['1200','2400','4800','9600','19200','38400','57600','115200'].map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const { data, isLoading } = useSWR<SettingsMap>('/api/settings', fetcher)
  const [form, setForm]             = useState<SettingsMap>({})
  const [saving, setSaving]         = useState(false)
  const [detectingPorts, setDetect] = useState(false)
  const [availablePorts, setPorts]  = useState<SerialPortInfo[]>([])
  const [testingPrinter, setTest]   = useState(false)
  const [printerStatus, setPStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [syncing, setSyncing]       = useState(false)
  const [seeding, setSeeding]       = useState(false)
  const [pendingCount, setPending]  = useState(0)
  const isOnline = useOfflineStore((s) => s.isOnline)

  useEffect(() => { getPendingCount().then(setPending) }, [])
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', fontSize: 13, color: colors.textSecondary }}>
        Access restricted to administrators.
      </div>
    )
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (res.ok) { toast.success('Settings saved'); mutate('/api/settings') }
    else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed to save') }
  }

  function set(key: keyof SettingsMap, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function detectPorts() {
    setDetect(true)
    const res = await fetch('/api/settings/printer-ports')
    setDetect(false)
    if (!res.ok) { toast.error('Could not detect ports'); return }
    const j = await res.json() as { cloudMode?: boolean; ports: SerialPortInfo[] }
    if (j.cloudMode) toast.info('Port detection only works on a local install.')
    else if (j.ports.length === 0) toast.info('No serial ports detected.')
    else setPorts(j.ports)
  }

  async function testPrint() {
    setTest(true); setPStatus('idle')
    const res = await fetch('/api/settings/test-print', { method: 'POST' })
    setTest(false)
    if (res.ok) { setPStatus('ok'); toast.success('Test page sent to printer') }
    else { setPStatus('err'); toast.error('Printer test failed') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Outer bordered container */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Title bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>Settings</span>
            <span style={{ fontSize: 11, color: '#6C757D' }}>System configuration</span>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* ── Yard Information ─── */}
              <SHdr title="Yard Information" />
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E0E0E0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                  <Field label="Yard / Business Name">
                    <input value={form.yardName ?? ''} onChange={(e) => set('yardName', e.target.value)} placeholder="e.g. Renovo Pro Yard" style={inp} />
                  </Field>
                  <Field label="VAT Registration Number">
                    <input value={form.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} placeholder="e.g. 4123456789" style={inp} />
                  </Field>
                  <Field label="Physical Address">
                    <input value={form.yardAddress ?? ''} onChange={(e) => set('yardAddress', e.target.value)} placeholder="Street, City, Province, Code" style={inp} />
                  </Field>
                  <Field label="Phone Number">
                    <input value={form.yardPhone ?? ''} onChange={(e) => set('yardPhone', e.target.value)} placeholder="+27 12 345 6789" style={inp} />
                  </Field>
                </div>
              </div>

              {/* ── Tax & Receipts ─── */}
              <SHdr title="Tax &amp; Receipts" />
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E0E0E0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px 12px' }}>
                  <Field label="VAT Rate (%)" hint="Used for expense VAT calculations. Default: 15%">
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={form.vatRate ?? '15'} onChange={(e) => set('vatRate', e.target.value)}
                      placeholder="15" style={inp}
                    />
                  </Field>
                  <Field label="Receipt Footer Text">
                    <input value={form.receiptFooter ?? ''} onChange={(e) => set('receiptFooter', e.target.value)} placeholder="e.g. Thank you for your business. All sales subject to SA law." style={inp} />
                  </Field>
                </div>
              </div>

              {/* ── Security / PIN ─── */}
              <SHdr title="Security &amp; PIN Lock" />
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E0E0E0' }}>
                <p style={{ fontSize: 11, color: '#6C757D', marginBottom: 8 }}>
                  Session lock activates after 5 minutes of inactivity. Users without a personal PIN use the default below.
                  Use <strong>Users → Reset PIN to Default</strong> to clear any user&apos;s custom PIN.
                </p>
                <div style={{ maxWidth: 180 }}>
                  <Field label="Default PIN (4 digits)" hint="Applies to users who have not set their own PIN. Default: 1234">
                    <input
                      value={form.defaultPin ?? '1234'}
                      onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); set('defaultPin', v) }}
                      maxLength={4} pattern="\d{4}" placeholder="1234"
                      style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.3em' }}
                    />
                  </Field>
                </div>
              </div>

              {/* ── Scale Configuration ─── */}
              <SHdr title="Scale Configuration" />
              <div style={{ borderBottom: '1px solid #E0E0E0' }}>
                <p style={{ fontSize: 11, color: '#6C757D', padding: '6px 10px 0' }}>
                  Configure up to 3 platform scales. TCP connects over your local network; Serial via RS232/USB-serial.
                </p>
                {SCALE_NUMS.map((n) => <ScaleRow key={n} n={n} form={form} set={set} />)}
              </div>

            </div>
          )}
        </div>
        {/* end LEFT COLUMN */}

        {/* ── RIGHT COLUMN — Printer + Offline ─────────────────────────── */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #C0C0C0', flexShrink: 0 }}>

          {/* Title bar (right) */}
          <div style={{ padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Printer style={{ width: 12, height: 12 }} /> Devices &amp; Sync
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* ── Thermal Printer ─── */}
            <SHdr title="Thermal Printer" />
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #C0C0C0' }}>
              <p style={{ fontSize: 10, color: '#6C757D', marginBottom: 8 }}>
                Configure a receipt printer via USB/Serial or TCP/IP. On cloud, receipts download instead.
              </p>
              <Field label="Connection Type">
                <Select value={(form.printerType ?? 'none') as PrinterType} onValueChange={(v) => set('printerType', v ?? '')}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not Connected</SelectItem>
                    <SelectItem value="serial">Serial / USB-Serial</SelectItem>
                    <SelectItem value="tcp">TCP / Network (IP)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {form.printerType === 'serial' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Field label="COM Port">
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        value={form.printerSerialPort ?? ''} onChange={(e) => set('printerSerialPort', e.target.value)}
                        placeholder="COM3 or /dev/usb/lp0" list="detected-ports"
                        style={{ ...inp, flex: 1, fontFamily: 'monospace' }}
                      />
                      <datalist id="detected-ports">
                        {availablePorts.map((p) => <option key={p.path} value={p.path}>{p.manufacturer ?? p.path}</option>)}
                      </datalist>
                      <button
                        onClick={detectPorts} disabled={detectingPorts}
                        style={{ height: 26, padding: '0 6px', borderRadius: 2, border: '1px solid #ABABAB', background: '#F5F5F5', color: '#6C757D', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: detectingPorts ? 0.5 : 1 }}
                        title="Auto-detect"
                      >
                        <RefreshCw className={`w-3 h-3 ${detectingPorts ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    {availablePorts.length > 0 && (
                      <p style={{ fontSize: 10, color: '#6C757D', marginTop: 2 }}>Detected: {availablePorts.map((p) => p.path).join(', ')}</p>
                    )}
                  </Field>
                  <Field label="Baud Rate">
                    <Select value={form.printerBaudRate ?? '9600'} onValueChange={(v) => set('printerBaudRate', v ?? '')}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['9600','19200','38400','57600','115200'].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}

              {form.printerType === 'tcp' && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <Field label="Printer IP">
                    <input value={form.printerIp ?? ''} onChange={(e) => set('printerIp', e.target.value)} placeholder="192.168.1.100" style={{ ...inp, fontFamily: 'monospace' }} />
                  </Field>
                  <Field label="Port">
                    <input value={form.printerTcpPort ?? '9100'} onChange={(e) => set('printerTcpPort', e.target.value)} placeholder="9100" style={{ ...inp, fontFamily: 'monospace' }} />
                  </Field>
                </div>
              )}

              {form.printerType && form.printerType !== 'none' && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={testPrint} disabled={testingPrinter}
                    style={{ height: 24, padding: '0 10px', borderRadius: 2, fontSize: 11, border: '1px solid #ABABAB', background: '#F5F5F5', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: testingPrinter ? 0.5 : 1 }}
                  >
                    {testingPrinter ? <><Loader2 className="w-3 h-3 animate-spin" /> Testing…</> : <><Printer className="w-3 h-3" /> Test Print</>}
                  </button>
                  {printerStatus === 'ok' && (
                    <span style={{ fontSize: 10, color: colors.action, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </span>
                  )}
                  {printerStatus === 'err' && (
                    <span style={{ fontSize: 10, color: colors.danger, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <XCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Offline Sync ─── */}
            <SHdr title="Offline Sync" />
            <div style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <WifiOff style={{ width: 12, height: 12, color: isOnline ? colors.action : colors.danger }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#212529', flex: 1 }}>Status</span>
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600, ...(isOnline ? { background: colors.actionBg, color: colors.action } : { background: colors.dangerBg, color: colors.danger }) }}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p style={{ fontSize: 10, color: '#6C757D', marginBottom: 8 }}>
                {pendingCount > 0
                  ? `${pendingCount} transaction${pendingCount > 1 ? 's' : ''} queued and waiting to sync.`
                  : 'All transactions are synced.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  disabled={syncing || !isOnline}
                  onClick={async () => { setSyncing(true); await triggerSync(); setPending(await getPendingCount()); setSyncing(false) }}
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    background: '#E0E0E0',
                    border: '1px solid #999',
                    borderRadius: 2,
                    cursor: (syncing || !isOnline) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    color: '#212529',
                    opacity: (syncing || !isOnline) ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => { if (!syncing && isOnline) e.currentTarget.style.background = '#D0D0D0' }}
                  onMouseLeave={(e) => { if (!syncing && isOnline) e.currentTarget.style.background = '#E0E0E0' }}
                >
                  {syncing ? <><Loader2 style={{ width: 9, height: 9 }} className="animate-spin" /> Syncing…</> : <><RefreshCw style={{ width: 9, height: 9 }} /> Sync Now{pendingCount > 0 ? ` (${pendingCount})` : ''}</>}
                </button>
                <button
                  disabled={seeding || !isOnline}
                  onClick={async () => { setSeeding(true); await runSeeder(true); setSeeding(false); toast.success('Offline data refreshed') }}
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    background: '#E0E0E0',
                    border: '1px solid #999',
                    borderRadius: 2,
                    cursor: (seeding || !isOnline) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    color: '#212529',
                    opacity: (seeding || !isOnline) ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => { if (!seeding && isOnline) e.currentTarget.style.background = '#D0D0D0' }}
                  onMouseLeave={(e) => { if (!seeding && isOnline) e.currentTarget.style.background = '#E0E0E0' }}
                >
                  {seeding ? <><Loader2 style={{ width: 9, height: 9 }} className="animate-spin" /> Refreshing…</> : <><RefreshCw style={{ width: 9, height: 9 }} /> Refresh Offline Data</>}
                </button>
              </div>
            </div>

          </div>
        </div>
        {/* end RIGHT COLUMN */}

      </div>
      {/* end outer bordered container */}

      {/* ── Bottom action bar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '6px 16px', borderTop: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#F5F5F5 0%,#E8E8E8 100%)', flexShrink: 0 }}>
        <button
          onClick={handleSave} disabled={saving}
          style={{ height: 28, padding: '0 24px', borderRadius: 2, fontSize: 12, fontWeight: 700, background: '#217346', border: '1px solid #176338', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Saving…</> : <><Save style={{ width: 13, height: 13 }} /> Save Settings</>}
        </button>
      </div>

    </div>
  )
}
