'use client'

import { useState, useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell } from '@/components/layout/PageShell'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ScaleType = 'none' | 'tcp' | 'serial'

type SettingsMap = {
  yardName?: string
  yardAddress?: string
  yardPhone?: string
  vatNumber?: string
  vatRate?: string
  receiptFooter?: string
  scale1Type?: ScaleType
  scale1Ip?: string
  scale1Port?: string
  scale1SerialPort?: string
  scale1BaudRate?: string
  scale2Type?: ScaleType
  scale2Ip?: string
  scale2Port?: string
  scale2SerialPort?: string
  scale2BaudRate?: string
  scale3Type?: ScaleType
  scale3Ip?: string
  scale3Port?: string
  scale3SerialPort?: string
  scale3BaudRate?: string
}

const SCALE_NUMS = [1, 2, 3] as const
type ScaleNum = typeof SCALE_NUMS[number]

function scaleKey<T extends string>(n: ScaleNum, field: T) {
  return `scale${n}${field.charAt(0).toUpperCase() + field.slice(1)}` as keyof SettingsMap
}

function ScaleRow({
  n,
  form,
  set,
}: {
  n: ScaleNum
  form: SettingsMap
  set: (k: keyof SettingsMap, v: string) => void
}) {
  const type = (form[scaleKey(n, 'type')] ?? 'none') as ScaleType
  return (
    <div className="rounded-lg p-4 space-y-3" style={{ border: `1px solid ${colors.border}` }}>
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold w-16" style={{ color: colors.textPrimary }}>Scale {n}</span>
        <div className="flex-1 max-w-[180px]">
          <Select
            value={type}
            onValueChange={(v) => set(scaleKey(n, 'type'), v ?? '')}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not Connected</SelectItem>
              <SelectItem value="tcp">TCP / Network</SelectItem>
              <SelectItem value="serial">Serial / RS232</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {type === 'tcp' && (
        <div className="grid grid-cols-2 gap-3 pl-20">
          <div>
            <Label className="text-xs">IP Address</Label>
            <Input
              value={form[scaleKey(n, 'ip')] ?? ''}
              onChange={(e) => set(scaleKey(n, 'ip'), e.target.value)}
              placeholder="192.168.1.100"
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Port</Label>
            <Input
              value={form[scaleKey(n, 'port')] ?? '8001'}
              onChange={(e) => set(scaleKey(n, 'port'), e.target.value)}
              placeholder="8001"
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
        </div>
      )}

      {type === 'serial' && (
        <div className="grid grid-cols-2 gap-3 pl-20">
          <div>
            <Label className="text-xs">Serial Port</Label>
            <Input
              value={form[scaleKey(n, 'serialPort')] ?? ''}
              onChange={(e) => set(scaleKey(n, 'serialPort'), e.target.value)}
              placeholder="COM3 or /dev/ttyUSB0"
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Baud Rate</Label>
            <Select
              value={form[scaleKey(n, 'baudRate')] ?? '9600'}
              onValueChange={(v) => set(scaleKey(n, 'baudRate'), v ?? '')}
            >
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['1200','2400','4800','9600','19200','38400','57600','115200'].map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const { data, isLoading } = useSWR<SettingsMap>('/api/settings', fetcher)

  const [form, setForm] = useState<SettingsMap>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!isAdmin) {
    return (
      <PageShell title="Settings" subtitle="System configuration">
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: colors.textSecondary }}>
          Access restricted to administrators.
        </div>
      </PageShell>
    )
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) { toast.success('Settings saved'); mutate('/api/settings') }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to save') }
  }

  function set(key: keyof SettingsMap, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <PageShell title="Settings" subtitle="System configuration">
      <div className="max-w-2xl mx-auto w-full space-y-5 pb-6">

      {isLoading ? (
        <div className="flex items-center gap-2 p-10" style={{ color: colors.textSecondary }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Yard Information ─────────────────────────── */}
          <div className="rounded-lg border p-5 space-y-4 bg-white" style={{ borderColor: colors.border }}>
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Yard Information</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Yard / Business Name</Label>
                <Input
                  value={form.yardName ?? ''}
                  onChange={(e) => set('yardName', e.target.value)}
                  className="mt-1"
                  placeholder="e.g. Renovo Pro Yard"
                />
              </div>
              <div>
                <Label>VAT Registration Number</Label>
                <Input
                  value={form.vatNumber ?? ''}
                  onChange={(e) => set('vatNumber', e.target.value)}
                  className="mt-1"
                  placeholder="e.g. 4123456789"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Physical Address</Label>
                <Input
                  value={form.yardAddress ?? ''}
                  onChange={(e) => set('yardAddress', e.target.value)}
                  className="mt-1"
                  placeholder="Street, City, Province, Code"
                />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input
                  value={form.yardPhone ?? ''}
                  onChange={(e) => set('yardPhone', e.target.value)}
                  className="mt-1"
                  placeholder="e.g. +27 12 345 6789"
                />
              </div>
            </div>
          </div>

          {/* ── Tax & Receipts ────────────────────────────── */}
          <div className="rounded-lg border p-5 space-y-4 bg-white" style={{ borderColor: colors.border }}>
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Tax &amp; Receipts</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>VAT Rate (%)</Label>
                <Input
                  value={form.vatRate ?? '15'}
                  onChange={(e) => set('vatRate', e.target.value)}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="mt-1"
                  placeholder="15"
                />
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Used for expense VAT calculations. Default: 15%</p>
              </div>
            </div>

            <div>
              <Label>Receipt Footer Text</Label>
              <Input
                value={form.receiptFooter ?? ''}
                onChange={(e) => set('receiptFooter', e.target.value)}
                className="mt-1"
                placeholder="e.g. Thank you for your business. All sales subject to SA law."
              />
            </div>
          </div>

          {/* ── Scale Configuration ───────────────────────── */}
          <div className="rounded-lg border p-5 space-y-4 bg-white" style={{ borderColor: colors.border }}>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Scale Configuration</h2>
              <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                Configure up to 3 platform scales. TCP connects over your local network;
                Serial connects via RS232/USB-serial adapter.
              </p>
            </div>

            {SCALE_NUMS.map((n) => (
              <ScaleRow key={n} n={n} form={form} set={set} />
            ))}
          </div>

          {/* ── Save ─────────────────────────────────────── */}
          <div className="flex justify-end pb-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
              style={{ background: colors.action }}
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : <><Save className="w-3.5 h-3.5" /> Save Settings</>}
            </button>
          </div>
        </div>
      )}
      </div>
    </PageShell>
  )
}
