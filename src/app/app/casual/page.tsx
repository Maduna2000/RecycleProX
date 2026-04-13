'use client'

import { useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Loader2, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; isActive: boolean; blacklisted: boolean; createdAt: string
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function statusBadge(c: Customer) {
  if (c.blacklisted)
    return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.dangerBg, color: colors.danger }}>Blacklisted</span>
  if (c.isActive)
    return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.actionBg, color: colors.action }}>Active</span>
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.neutralBg, color: colors.textSecondary }}>Inactive</span>
}

export default function CasualDetailsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search, setSearch]         = useState('')
  const [letter, setLetter]         = useState<string | null>(null)
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

  const count = data?.total ?? 0
  const subtitle = `${count} casual seller${count !== 1 ? 's' : ''} on record`

  return (
    <PageShell title="Casual Details" subtitle={subtitle}>
      <div className="flex flex-col flex-1 min-h-0 gap-3">

        {/* Actions row */}
        {isManager && (
          <div className="flex justify-end shrink-0">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors"
              style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary, background: colors.surface }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
              onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface)}
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLetter(null) }}
            placeholder="Search by name or ID number…"
            className="pl-7 h-7 text-xs border-[#E0E0E0]"
          />
        </div>

        {/* A–Z quick filter */}
        <div className="flex flex-wrap gap-1 shrink-0">
          <button
            onClick={() => setLetter(null)}
            className="px-2 py-0.5 text-xs font-medium rounded transition-colors"
            style={letter === null
              ? { background: colors.process, color: colors.surface }
              : { background: colors.neutralBg, color: colors.textSecondary }}
          >
            All
          </button>
          {ALPHA.map((l) => (
            <button
              key={l}
              onClick={() => { setLetter(l === letter ? null : l); setSearch('') }}
              className="px-2 py-0.5 text-xs font-medium rounded transition-colors"
              style={letter === l
                ? { background: colors.process, color: colors.surface }
                : { background: colors.neutralBg, color: colors.textSecondary }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
          {isLoading ? (
            <div className="flex items-center justify-center p-10" style={{ color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : !customers.length ? (
            <div className="text-center p-10 text-sm" style={{ color: colors.textSecondary }}>
              {letter
                ? `No casual customers with surname starting with "${letter}"`
                : 'No casual customers found'}
            </div>
          ) : (
            <table className="w-full bg-white">
              <thead style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}>
                <tr>
                  {['Name', 'ID Number', 'Phone', 'Registered', 'Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-2" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer"
                    style={{ borderBottom: i < customers.length - 1 ? `1px solid ${colors.neutralBg}` : 'none' }}
                    onClick={() => router.push(`/app/customers/${c.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-2.5 font-medium" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
                      {c.lastName}, {c.firstName}
                    </td>
                    <td className="px-4 py-2.5 font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{c.idNumber}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{c.phone}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                      {new Date(c.createdAt).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-4 py-2.5">{statusBadge(c)}</td>
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
              mutate((key) => typeof key === 'string' && key.includes('/api/customers'), undefined, { revalidate: true })
              setImportOpen(false)
            }}
          />
        )}
      </div>
    </PageShell>
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
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Upload a CSV file with customer details. Existing customers (matched by ID number) will be updated.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1 text-xs shrink-0 ml-3 hover:underline"
              style={{ color: colors.process }}
            >
              <Download className="w-3.5 h-3.5" /> Template
            </button>
          </div>

          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
            style={{ borderColor: colors.border }}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: colors.textSecondary }} />
            <p className="text-sm" style={{ color: colors.textSecondary }}>{fileName || 'Click to select a .csv file'}</p>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Max 5 MB</p>
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
            <div className="rounded-lg p-4 space-y-2" style={{ border: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: colors.action }}>
                <CheckCircle2 className="w-4 h-4" />
                <span>{result.imported} new customers imported · {result.skipped} updated</span>
              </div>
              {result.errors.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-sm mb-1" style={{ color: colors.danger }}>
                    <AlertCircle className="w-4 h-4" />
                    <span>{result.errors.length} row error{result.errors.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.map((e) => (
                      <p key={e.row} className="text-xs font-mono" style={{ color: colors.danger }}>Row {e.row}: {e.reason}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Close</Button>
            <button
              onClick={handleImport}
              disabled={loading || !fileName}
              className="h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: colors.action }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#185A38')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.background = colors.action)}
            >
              {loading ? <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />Importing…</span> : 'Import'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
