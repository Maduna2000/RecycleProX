'use client'

import { useState, useEffect } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Settings, Save } from 'lucide-react'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Settings = {
  yardName?: string
  yardAddress?: string
  vatNumber?: string
  vatRate?: string
  receiptFooter?: string
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const { data, isLoading } = useSWR<Settings>('/api/settings', fetcher)

  const [form, setForm] = useState<Settings>({})
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

  function set(key: keyof Settings, value: string) {
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
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide text-gray-500">Yard Information</h2>

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

          <hr />

          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide text-gray-500">Tax & Receipts</h2>

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

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save Settings</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
