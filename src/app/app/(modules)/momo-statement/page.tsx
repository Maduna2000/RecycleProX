'use client'

import { useRef, useState } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Upload, Loader2, Trash2, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { format } from '@/lib/utils/format'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import { Btn, PortalPage, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
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

type MomoLine = {
  id: string
  externalTxnId: string | null
  transactionDate: string
  status: string
  type: string
  fromName: string | null
  toName: string | null
  toMessage: string | null
  amount: string
  fee: string
  balance: string | null
}

type MomoImportDetail = MomoImport & { lines: MomoLine[] }

export default function MomoStatementPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MomoImport | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const query = `page=${page}&pageSize=50`
  const { data, isLoading, error } = useSWR<{ imports: MomoImport[]; total: number }>(
    `/api/momo-statements?${query}`,
    fetcher,
  )
  const imports = data?.imports ?? []

  const { data: detail, isLoading: detailLoading } = useSWR<MomoImportDetail>(
    selectedId ? `/api/momo-statements/${selectedId}` : null,
    fetcher,
  )

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
      label:   'Delete',
      icon:    Trash2,
      danger:  true,
      hidden:  () => !isManager,
      onClick: (row) => setDeleteTarget(row),
    },
  ]

  return (
    <PortalPage
      title="MoMo Statement"
      actions={
        isManager && (
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFilePicked} disabled={uploading} />
            <Btn size="sm" icon={uploading ? Loader2 : Upload} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Importing…' : 'Upload Statement'}
            </Btn>
          </>
        )
      }
    >
      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={imports}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          selectedKey={selectedId}
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

      {/* Inline detail panel — day's summary + full transaction list */}
      <InlineDetailPanel
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={detail ? `${format.date(detail.statementDate)} · ${detail.fileName}` : 'Statement Detail'}
        height={420}
      >
        {detailLoading || !detail ? (
          <div className="flex items-center gap-2" style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-3 h-full">
            {/* Summary strip */}
            <div className="grid grid-cols-5 gap-2 shrink-0">
              <SummaryTile label="Total Sent" value={`R ${new Decimal(detail.totalSent).toFixed(2)}`} color={colors.process} />
              <SummaryTile label="Total Received" value={`R ${new Decimal(detail.totalReceived).toFixed(2)}`} color={colors.action} />
              <SummaryTile label="Total Fees" value={`R ${new Decimal(detail.totalFees).toFixed(2)}`} color={colors.textSecondary} />
              <SummaryTile
                label="Opening → Closing"
                value={
                  detail.openingBalance != null && detail.closingBalance != null
                    ? `R ${new Decimal(detail.openingBalance).toFixed(2)} → R ${new Decimal(detail.closingBalance).toFixed(2)}`
                    : '—'
                }
                color={colors.textPrimary}
              />
              <SummaryTile
                label="Transactions"
                value={`${detail.transactionCount}${detail.failedCount > 0 ? ` (${detail.failedCount} failed)` : ''}`}
                color={colors.textPrimary}
              />
            </div>

            {/* Line items */}
            <div className="flex-1 overflow-auto">
              <table className="w-full" style={{ fontSize: fontSize.sm, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    {['Time', 'Type', 'From', 'To', 'Amount', 'Fee', 'Balance', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="text-left pb-1"
                        style={{ fontSize: 10, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textSecondary }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => {
                    const amt = new Decimal(line.amount)
                    return (
                      <tr key={line.id} style={{ borderBottom: `1px solid ${colors.bg}`, opacity: line.status === 'Successful' ? 1 : 0.5 }}>
                        <td style={{ padding: '4px 8px 4px 0', color: colors.textSecondary, fontSize: fontSize.xs }}>
                          {new Date(line.transactionDate).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '4px 8px 4px 0', color: colors.textPrimary }}>{line.type}</td>
                        <td style={{ padding: '4px 8px 4px 0', color: colors.textPrimary }}>{line.fromName ?? '—'}</td>
                        <td style={{ padding: '4px 8px 4px 0', color: colors.textPrimary }}>
                          {line.toName ?? '—'}
                          {line.toMessage && <span style={{ color: colors.textSecondary }}> · {line.toMessage}</span>}
                        </td>
                        <td className="font-mono" style={{ padding: '4px 8px 4px 0', fontWeight: fontWeight.semibold, color: amt.isNegative() ? colors.process : colors.action }}>
                          {amt.isNegative() ? '−' : '+'}R {amt.abs().toFixed(2)}
                        </td>
                        <td className="font-mono" style={{ padding: '4px 8px 4px 0', color: colors.textSecondary }}>
                          {new Decimal(line.fee).gt(0) ? `R ${new Decimal(line.fee).toFixed(2)}` : '—'}
                        </td>
                        <td className="font-mono" style={{ padding: '4px 8px 4px 0', color: colors.textSecondary }}>
                          {line.balance != null ? `R ${new Decimal(line.balance).toFixed(2)}` : '—'}
                        </td>
                        <td style={{ padding: '4px 0' }}><StatusBadge status={line.status === 'Successful' ? 'completed' : 'voided'} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </InlineDetailPanel>

      {deleteTarget && (
        <DeleteDialog
          statement={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            revalidate()
            if (selectedId === deleteTarget.id) setSelectedId(null)
            setDeleteTarget(null)
          }}
        />
      )}
    </PortalPage>
  )
}

function SummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 2, padding: '6px 8px', background: colors.surface }}>
      <p className="uppercase tracking-wide" style={{ fontSize: 9, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>{label}</p>
      <p className="font-mono" style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color }}>{value}</p>
    </div>
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
