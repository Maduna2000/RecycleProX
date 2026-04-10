'use client'

import { useState, useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Settings, Save } from 'lucide-react'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ScaleType = 'none' | 'tcp' | 'serial'

type SettingsMap = {
  yardName?: string
  yardAddress?: string
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
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700 w-16">Scale {n}</span>
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
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Access restricted to administrators.
      </div>
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
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-green-700" />
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 p-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Yard Information ─────────────────────────── */}
          <div className="bg-white rounded-xl border p-6 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Yard Information</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Yard / Business Name</Label>
                <Input
                  value={form.yardName ?? ''}
                  onChange={(e) => set('yardName', e.target.value)}
                  className="mt-1"
                  placeholder="e.g. RecycleProX Yard"
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

            <div>
              <Label>Physical Address</Label>
              <Input
                value={form.yardAddress ?? ''}
                onChange={(e) => set('yardAddress', e.target.value)}
                className="mt-1"
                placeholder="Street, City, Province, Code"
              />
            </div>
          </div>

          {/* ── Tax & Receipts ────────────────────────────── */}
          <div className="bg-white rounded-xl border p-6 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Tax &amp; Receipts</h2>

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
                <p className="text-xs text-gray-400 mt-1">Used for expense VAT calculations. Default: 15%</p>
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
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Scale Configuration</h2>
              <p className="text-xs text-gray-400 mt-1">
                Configure up to 3 platform scales. TCP connects over your local network;
                Serial connects via RS232/USB-serial adapter.
              </p>
            </div>

            {SCALE_NUMS.map((n) => (
              <ScaleRow key={n} n={n} form={form} set={set} />
            ))}
          </div>

          {/* ── Save ─────────────────────────────────────── */}
          <div className="flex justify-end pb-6">
            <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                : <><Save className="w-4 h-4 mr-2" />Save Settings</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
