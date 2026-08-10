'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Upload, Loader2, Trash2, Smartphone, Eye } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { format } from '@/lib/utils/format'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import { Btn, PortalPage, FilterBar, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { Dialog } from '@/components/ui/dialog'

type MomoImport = {
  id: string
  fileName: string
  statementDate: string
  totalSent: string
  totalReceived: string
  totalFees: string
  transactionCount: number
  failedCount: number
  openingBalance: string | null
  closingBalance: string | null
  createdAt: string
}

export default function MomoStatementPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MomoImport | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const query = `page=${page}&pageSize=50`
  const { data, isLoading, error } = useSWR<{ imports: MomoImport[]; total: number }>(
    `/api/momo-statements?${query}`,
    fetcher,
  )
  const imports = data?.imports ?? []

  function revalidate() {
    swrMutate((key) => typeof key === 'string' && key.startsWith('/api/momo-statements'))
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/momo-statements', { method: 'POST', body: fd })
    setUploading(false)

    if (res.ok) {
      const j = await res.json()
      const skippedNote = j.skippedRows > 0 ? ` (${j.skippedRows} row${j.skippedRows === 1 ? '' : 's'} skipped — couldn't parse)` : ''
      toast.success(`Statement imported for ${format.date(j.import.statementDate)}${skippedNote}`)
      revalidate()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to import statement')
    }
  }

  const columns: Column<MomoImport>[] = [
    {
      key: 'statementDate',
      header: 'Date',
      width: '120px',
      render: (row) => (
        <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
          {format.date(row.statementDate)}
        </span>
      ),
    },
    {
      key: 'transactionCount',
      header: 'Txns',
      width: '70px',
      align: 'right',
      render: (row) => <span style={{ color: colors.textSecondary }}>{row.transactionCount}</span>,
    },
    {
      key: 'totalSent',
      header: 'Total Sent',
      width: '120px',
      align: 'right',
      render: (row) => (
        <span className="font-mono" style={{ color: colors.process, fontWeight: fontWeight.semibold }}>
          R {new Decimal(row.totalSent).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'totalReceived',
      header: 'Total Received',
      width: '130px',
      align: 'right',
      render: (row) => (
        <span className="font-mono" style={{ color: colors.action, fontWeight: fontWeight.semibold }}>
          R {new Decimal(row.totalReceived).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'totalFees',
      header: 'Fees',
      width: '100px',
      align: 'right',
      render: (row) => (
        <span className="font-mono" style={{ color: colors.textSecondary }}>
          R {new Decimal(row.totalFees).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'closingBalance',
      header: 'Closing Balance',
      width: '130px',
      align: 'right',
      render: (row) => (
        <span className="font-mono" style={{ color: colors.textSecondary }}>
          {row.closingBalance != null ? `R ${new Decimal(row.closingBalance).toFixed(2)}` : '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Uploaded',
      width: '148px',
      render: (row) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{format.datetime(row.createdAt)}</span>
      ),
    },
  ]

  const rowActions: RowAction<MomoImport>[] = [
    {
      label:   'View Details',
      icon:    Eye,
      onClick: (row) => router.push(`/app/momo-statement/${row.id}`),
    },
    {
      label:   'Delete',
      icon:    Trash2,
      danger:  true,
      hidden:  () => !isManager,
      onClick: (row) => setDeleteTarget(row),
    },
  ]

  return (
    <PortalPage title="MoMo Statement">
      <FilterBar>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFilePicked} disabled={uploading} />
        {isManager && (
          <Btn size="sm" icon={uploading ? Loader2 : Upload} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Importing…' : 'Upload Statement'}
          </Btn>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textSecondary, paddingBottom: 8 }}>
          {data?.total ?? imports.length} statement{(data?.total ?? imports.length) !== 1 ? 's' : ''}
        </span>
      </FilterBar>

      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={imports}
          rowKey={(r) => r.id}
          rowActions={rowActions}
          loading={isLoading}
          error={error}
          emptyMessage="No MoMo statements uploaded yet"
          emptyIcon={Smartphone}
          emptyAction={isManager ? { label: 'Upload Statement', onClick: () => fileRef.current?.click() } : undefined}
          total={data?.total}
          page={page}
          pageSize={50}
          onPageChange={setPage}
        />
      </div>

      {deleteTarget && (
        <DeleteDialog
          statement={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            revalidate()
            setDeleteTarget(null)
          }}
        />
      )}
    </PortalPage>
  )
}

// ─── Delete Dialog ──────────────────────────────────────────────────────────────

function DeleteDialog({ statement, onClose, onSuccess }: { statement: MomoImport; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    setLoading(true)
    const res = await fetch(`/api/momo-statements/${statement.id}`, { method: 'DELETE' })
    setLoading(false)
    if (res.ok) { toast.success('Statement deleted'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete statement') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title="Delete MoMo Statement" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: 0 }}>
            Delete the statement for{' '}
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>{format.date(statement.statementDate)}</span>?
            This only removes the imported record — it has no effect on Purchases, Sales, or the actual MoMo wallet.
          </p>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm} loading={loading}>Delete</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
