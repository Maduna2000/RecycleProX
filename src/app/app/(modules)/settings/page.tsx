'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save, Printer, RefreshCw, CheckCircle2, XCircle, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'
import { useOfflineStore } from '@/stores/offlineStore'
import { triggerSync, getPendingCount } from '@/lib/offline/sync'
import { runSeeder } from '@/lib/offline/seeder'
import { DEFAULT_POLICE_SERVICE_NAME, DEFAULT_POLICE_LEGAL_NOTE } from '@/lib/police-defaults'
import { inp, HEADER_GRAD, NAVY, Btn, Field, PortalPage } from '@/components/rpx'
import { TradeCommoditiesModal } from './_components/TradeCommoditiesModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ScaleType   = 'none' | 'tcp' | 'serial'
type PrinterType = 'none' | 'serial' | 'tcp'

type SettingsMap = {
  yardName?: string; yardAddress?: string; yardPhone?: string
  vatNumber?: string; vatRate?: string; receiptFooter?: string
  purchaseNoteDeclaration?: string; saleNoteDeclaration?: string
  companyLogoR2Key?: string
  defaultPin?: string
  police_service_name?: string; police_legal_note?: string
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

// ─── Section header (portal card-section style) ───────────────────────────────
function SHdr({ title }: { title: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{title}</span>
    </div>
  )
}

type SerialPortInfo = { path: string; manufacturer: string | null }

// ─── Company logo (used on purchase/sale notes and other documents) ───────────
function LogoSection({ logoKey }: { logoKey?: string }) {
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: urlData } = useSWR<{ url: string }>(
    logoKey ? `/api/r2/view-url?key=${encodeURIComponent(logoKey)}` : null,
    fetcher
  )

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/logo', { method: 'POST', body: fd })
      const j = await res.json() as { error?: string; width?: number; height?: number }
      if (!res.ok) { toast.error(j.error ?? 'Upload failed'); return }
      toast.success(`Logo uploaded (${j.width}×${j.height}px)`)
      mutate('/api/settings')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const res = await fetch('/api/settings/logo', { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove logo'); return }
      toast.success('Logo removed')
      mutate('/api/settings')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <SHdr title="Company Logo" />
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #E0E0E0' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {/* Preview on a checker background so transparency is visible */}
          <div style={{
            width: 180, height: 72, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #ABABAB', borderRadius: 2,
            backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,#fff 25%,#fff 75%,#ddd 75%)',
            backgroundSize: '12px 12px', backgroundPosition: '0 0, 6px 6px',
          }}>
            {logoKey && urlData?.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={urlData.url} alt="Company logo" style={{ maxWidth: 170, maxHeight: 62, objectFit: 'contain' }} />
              : <span style={{ fontSize: 10, color: '#9CA3AF' }}>No logo uploaded</span>}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, color: '#6C757D', marginBottom: 6 }}>
              Shown on generated documents (purchase notes, sale notes). Requirements:
            </p>
            <ul style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 8, paddingLeft: 16, listStyle: 'disc' }}>
              <li>PNG with a <strong>transparent background</strong> (required)</li>
              <li>Maximum file size 1 MB</li>
              <li>Width 100–2000&nbsp;px</li>
              <li>Square to wide shape — width:height between 1:1 and 5:1</li>
            </ul>
            <div style={{ display: 'flex', gap: 6 }}>
              <input ref={fileRef} type="file" accept="image/png" onChange={handleFile} style={{ display: 'none' }} />
              <Btn size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Uploading…' : logoKey ? 'Replace Logo' : 'Upload Logo'}
              </Btn>
              {logoKey && (
                <Btn size="sm" variant="danger" loading={removing} onClick={handleRemove}>
                  {removing ? 'Removing…' : 'Remove'}
                </Btn>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ScaleRow({ n, form, set }: { n: ScaleNum; form: SettingsMap; set: (k: keyof SettingsMap, v: string) => void }) {
  const type = (form[scaleKey(n, 'type')] ?? 'none') as ScaleType
  return (
    <div style={{ borderTop: n > 1 ? '1px solid #E0E0E0' : undefined, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: type !== 'none' ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B', width: 52 }}>Scale {n}</span>
        <div style={{ width: 170 }}>
          <Select value={type} onValueChange={(v) => set(scaleKey(n, 'type'), v ?? '')}>
            <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
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
              <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
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
  const [tradeCommoditiesOpen, setTradeCommoditiesOpen] = useState(false)
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
    <PortalPage title="System Configuration">
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

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

              {/* ── Company Logo ─── */}
              <LogoSection logoKey={form.companyLogoR2Key || undefined} />

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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px 12px', marginTop: 8 }}>
                  <Field label="Purchase Note Declaration" hint="Printed above the totals on purchase notes. Leave blank for the standard lawful-owner wording.">
                    <input
                      value={form.purchaseNoteDeclaration ?? ''}
                      onChange={(e) => set('purchaseNoteDeclaration', e.target.value)}
                      placeholder="I hereby state that I am the lawful owner of the material listed above and have sold them to … to dispose of as they see fit."
                      style={inp}
                    />
                  </Field>
                  <Field label="Sale Note Declaration" hint="Printed above the totals on sale notes. Leave blank for the standard release-of-goods wording.">
                    <input
                      value={form.saleNoteDeclaration ?? ''}
                      onChange={(e) => set('saleNoteDeclaration', e.target.value)}
                      placeholder="Goods listed above sold and released to the buyer. Errors and omissions excepted."
                      style={inp}
                    />
                  </Field>
                </div>
              </div>

              {/* ── Police Register ─── */}
              <SHdr title="Police Register" />
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E0E0E0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px 12px' }}>
                  <Field label="Police Service Name" hint="Shown on the officer portal and printed on register documents.">
                    <input
                      value={form.police_service_name ?? ''}
                      onChange={(e) => set('police_service_name', e.target.value)}
                      placeholder={DEFAULT_POLICE_SERVICE_NAME}
                      style={inp}
                    />
                  </Field>
                  <Field label="Legal / Retention Note" hint="Compliance wording shown on the portal and printed on the daily register and inspection certificates.">
                    <textarea
                      value={form.police_legal_note ?? ''}
                      onChange={(e) => set('police_legal_note', e.target.value)}
                      placeholder={DEFAULT_POLICE_LEGAL_NOTE}
                      rows={2}
                      style={{ ...inp, height: 'auto', padding: '5px 7px', resize: 'vertical' }}
                    />
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

              {/* ── Data Management ─── */}
              <SHdr title="Data Management" />
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E0E0E0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#212529' }}>Trade Commodity Categories</span>
                    <p style={{ fontSize: 11, color: '#6C757D', marginTop: 2 }}>
                      Configure the list of commodities shown when registering account customers.
                    </p>
                  </div>
                  <Btn size="sm" onClick={() => setTradeCommoditiesOpen(true)} style={{ whiteSpace: 'nowrap' }}>
                    Manage →
                  </Btn>
                </div>
              </div>

            </div>
          )}
        </div>
        {/* end LEFT COLUMN */}

        {/* ── RIGHT COLUMN — Printer + Offline ─────────────────────────── */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #C0C0C0', flexShrink: 0 }}>

          {/* Title bar (right) */}
          <div style={{ padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: HEADER_GRAD, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: NAVY, display: 'flex', alignItems: 'center', gap: 5 }}>
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
                  <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
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
                      <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
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
                  <Btn size="sm" icon={Printer} loading={testingPrinter} onClick={testPrint}>
                    {testingPrinter ? 'Testing…' : 'Test Print'}
                  </Btn>
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
              <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 5, alignItems: 'center' }}>
                <Btn
                  size="sm"
                  icon={RefreshCw}
                  loading={syncing}
                  disabled={!isOnline}
                  style={{ padding: '4px 8px', flex: 1, justifyContent: 'center' }}
                  onClick={async () => { setSyncing(true); await triggerSync(); setPending(await getPendingCount()); setSyncing(false) }}
                >
                  {syncing ? 'Syncing…' : `Sync Now${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
                </Btn>
                <Btn
                  size="sm"
                  icon={RefreshCw}
                  loading={seeding}
                  disabled={!isOnline}
                  title="Refresh offline data"
                  style={{ padding: '4px 8px', flex: 1, justifyContent: 'center' }}
                  onClick={async () => { setSeeding(true); await runSeeder(true); setSeeding(false); toast.success('Offline data refreshed') }}
                >
                  {seeding ? 'Refreshing…' : 'Refresh Data'}
                </Btn>
              </div>
            </div>

          </div>
        </div>
        {/* end RIGHT COLUMN */}

      </div>

      {/* ── Bottom action bar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 16px', borderTop: '1px solid #E0E0E0', background: '#F8F9FA', flexShrink: 0 }}>
        <Btn variant="primary" icon={Save} loading={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Settings'}
        </Btn>
      </div>

      {tradeCommoditiesOpen && (
        <TradeCommoditiesModal onClose={() => setTradeCommoditiesOpen(false)} />
      )}
    </PortalPage>
  )
}
