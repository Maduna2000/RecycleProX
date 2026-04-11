'use client'

import { useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Loader2, UserCheck, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; isActive: boolean; blacklisted: boolean; createdAt: string
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function CasualDetailsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search, setSearch]       = useState('')
  const [letter, setLetter]       = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const params = new URLSearchParams({ type: 'casual', limit: '200' })
  if (search) params.set('search', search)
  const { data, isLoading } = useSWR<{ customers: Customer[]; total: number }>(
    `/api/customers?${params}`,
    fetcher,
  )

  const customers = (data?.customers ?? []).filter((c) =>
    letter ? c.lastName.toUpperCase().startsWith(letter) : true,
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Casual Details</h1>
            <p className="text-sm text-gray-500">
              {data?.total ?? 0} casual seller{(data?.total ?? 0) !== 1 ? 's' : ''} on record
            </p>
          </div>
        </div>
        {isManager && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setLetter(null) }}
          placeholder="Search by name or ID number..."
          className="pl-9"
        />
      </div>

      {/* A–Z quick filter */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setLetter(null)}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            letter === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {ALPHA.map((l) => (
          <button
            key={l}
            onClick={() => { setLetter(l === letter ? null : l); setSearch('') }}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              letter === l ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : !customers.length ? (
          <div className="text-center p-10 text-gray-400">
            {letter ? `No casual customers with surname starting with "${letter}"` : 'No casual customers found'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Name', 'ID Number', 'Phone', 'Registered', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/app/customers/${c.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {c.lastName}, {c.firstName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.idNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString('en-ZA')}
                  </td>
                  <td className="px-4 py-3">
                    {c.blacklisted ? (
                      <Badge variant="destructive">Blacklisted</Badge>
                    ) : c.isActive ? (
                      <Badge className="bg-green-100 text-green-700">Active</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-500">Inactive</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {importOpen && (
        <ImportCsvModal
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            // Invalidate all customer queries
            mutate((key) => typeof key === 'string' && key.includes('/api/customers'), undefined, { revalidate: true })
            setImportOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Import CSV Modal ──────────────────────────────────────────────────────────

type ImportResult = { imported: number; skipped: number; errors: { row: number; reason: string }[] }

function ImportCsvModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')

  function downloadTemplate() {
    const headers = 'idNumber,firstName,lastName,phone,dateOfBirth,gender,nationality,physicalAddress'
    const example = '8001015009087,John,Doe,0821234567,1980-01-01,male,South African,123 Main St Pretoria'
    const blob = new Blob([headers + '\n' + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'casual-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Please select a CSV file'); return }
    setLoading(true)
    setResult(null)
    const form = new FormData()
    form.append('csv', file)
    const res = await fetch('/api/casual/import', { method: 'POST', body: form })
    setLoading(false)
    const j = await res.json() as ImportResult & { error?: string }
    if (res.ok || res.status === 422) {
      setResult(j)
      if (j.imported > 0) {
        toast.success(`Imported ${j.imported} new customer${j.imported !== 1 ? 's' : ''}`)
        onSuccess()
      }
    } else {
      toast.error(j.error ?? 'Import failed')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Import Casual Customers from CSV</DialogTitle></DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Upload a CSV file with customer details. Existing customers (matched by ID number) will be updated.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-3"
            >
              <Download className="w-3.5 h-3.5" /> Template
            </button>
          </div>

          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">{fileName || 'Click to select a .csv file'}</p>
            <p className="text-xs text-gray-400 mt-1">Max 5 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            />
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>{result.imported} new customers imported · {result.skipped} updated</span>
              </div>
              {result.errors.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-sm text-red-600 mb-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>{result.errors.length} row error{result.errors.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.map((e) => (
                      <p key={e.row} className="text-xs text-red-500 font-mono">Row {e.row}: {e.reason}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Close</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleImport} disabled={loading || !fileName}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
