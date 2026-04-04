'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDown, Loader2, ShieldCheck } from 'lucide-react'

export default function PoliceRegisterPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const [date, setDate]         = useState(today)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Access restricted to managers and administrators.
      </div>
    )
  }

  async function handleDownload() {
    if (!date) return
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/police-register?date=${date}`)
    setLoading(false)

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError((j as { error?: string }).error ?? 'Failed to generate register')
      return
    }

    // Trigger browser download
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `police-register-${date}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-700" />
          <h1 className="text-2xl font-bold text-gray-900">Police Register</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Daily purchase register required under the South African
          Second-Hand Goods Act (Act 6 of 2009).
        </p>
      </div>

      {/* Date picker + download */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <Label htmlFor="reg-date">Register Date</Label>
          <Input
            id="reg-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-48"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
        )}

        <Button onClick={handleDownload} disabled={loading || !date}>
          {loading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating PDF...</>
            : <><FileDown className="w-4 h-4 mr-2" />Download Register PDF</>}
        </Button>
      </div>

      {/* Legal note */}
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Legal requirement</p>
        <p>
          This register must be kept for at least 5 years and made available
          to the South African Police Service on request. Each page must be
          signed by the dealer.
        </p>
      </div>
    </div>
  )
}
