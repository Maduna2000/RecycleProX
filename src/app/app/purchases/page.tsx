'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Search, Eye, Ban, Printer, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, StatusBadge, Avatar, type Column, type RowAction, type SortDir } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from '@/lib/utils/format'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Purchase = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  paymentMethod: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string }
  lines: { id: string }[]
}

type PurchaseLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  product: { id: string; code: string; name: string; unit: string }
}

type PurchaseDetail = {
  id: string
  refNumber: string
  status: string
  totalAmount: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  voidReason?: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string; phone: string }
  lines: PurchaseLine[]
}

export default function PurchasesPage() {
  const router   = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('')
  const [page,       setPage]       = useState(1)
  const [sortKey,    setSortKey]    = useState<string | null>(null)
  const [sortDir,    setSortDir]    = useState<SortDir>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Purchase | null>(null)

  const query = new URLSearchParams({
    ...(search  && { search }),
    ...(status  && { status }),
    ...(sortKey && sortDir && { sortKey, sortDir }),
    page:     String(page),
    pageSize: '50',
  })

  const { data, isLoading } = useSWR<{ purchases: Purchase[]; total: number }>(
    `/api/purchases?${query}`,
    fetcher,
  )
  const purchases = data?.purchases ?? []

  const { data: detail, isLoading: detailLoading } = useSWR<PurchaseDetail>(
    selectedId ? `/api/purchases/${selectedId}` : null,
    fetcher,
  )

  const handleSort = useCallback((key: string, dir: SortDir) => {
    setSortKey(dir ? key : null)
    setSortDir(dir)
  }, [])

  const columns: Column<Purchase>[] = [
    {
      key: 'refNumber',
      header: 'Ref #',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs" style={{ color: '#6C757D' }}>{row.refNumber}</span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${row.customer.firstName} ${row.customer.lastName}`} size={26} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>
              {row.customer.firstName} {row.customer.lastName}
            </p>
            <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{row.customer.idNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'lines',
      header: 'Lines',
      width: '56px',
      render: (row) => <span style={{ color: '#6C757D' }}>{row.lines.length}</span>,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      width: '110px',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-semibold" style={{ color: '#212529' }}>
          R {new Decimal(row.totalAmount).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Payment',
      width: '96px',
      render: (row) => (
        <span className="capitalize" style={{ fontSize: 12, color: '#6C757D' }}>{row.paymentMethod}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '148px',
      sortable: true,
      render: (row) => (
        <span style={{ fontSize: 11, color: '#6C757D' }}>{format.datetime(row.createdAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ]

  const rowActions: RowAction<Purchase>[] = [
    {
      label:   'View Full Detail',
      icon:    Eye,
      onClick: (row) => router.push(`/app/purchases/${row.id}`),
    },
    {
      label:   'Print Receipt',
      icon:    Printer,
      onClick: (row) => window.open(`/api/purchases/${row.id}/receipt?format=pdf`, '_blank'),
    },
    {
      label:   'Download VAT264',
      icon:    FileText,
      onClick: (row) => window.open(`/api/purchases/${row.id}/vat264`, '_blank'),
    },
    {
      label:   'Void Purchase',
      icon:    Ban,
      danger:  true,
      hidden:  (row) => !isManager || row.status === 'voided',
      onClick: (row) => setVoidTarget(row),
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="shrink-0">
        <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Purchases</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>{data?.total ?? 0} total records</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#6C757D' }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search ref, customer name or ID..."
            className="pl-7 pr-3 py-1 text-xs rounded border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] w-72"
          />
        </div>
        <select
          className="border border-[#E0E0E0] rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#185ABD]"
          style={{ color: '#212529' }}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      {/* Table — grows to fill available height */}
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={purchases}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          selectedKey={selectedId}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No purchases found"
          emptyAction={{ label: '+ New Purchase', onClick: () => router.push('/app/purchases/new') }}
          total={data?.total}
          page={page}
          pageSize={50}
          onPageChange={setPage}
          onSort={handleSort}
          sortKey={sortKey}
          sortDir={sortDir}
        />
      </div>

      {/* Inline detail panel — slides up from bottom */}
      <InlineDetailPanel
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={
          detail
            ? `${detail.refNumber} · ${detail.customer.firstName} ${detail.customer.lastName}`
            : 'Purchase Detail'
        }
        height={300}
      >
        {detailLoading || !detail ? (
          <div className="flex items-center gap-2" style={{ color: '#6C757D', fontSize: 12 }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex gap-6 h-full">

            {/* Left: meta */}
            <div className="w-44 shrink-0 space-y-3">
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Customer</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#212529' }}>
                  {detail.customer.firstName} {detail.customer.lastName}
                </p>
                <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{detail.customer.idNumber}</p>
                {detail.customer.phone && (
                  <p style={{ fontSize: 11, color: '#6C757D' }}>{detail.customer.phone}</p>
                )}
              </div>
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Payment</p>
                <p className="capitalize" style={{ fontSize: 12, color: '#212529' }}>{detail.paymentMethod}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Date</p>
                <p style={{ fontSize: 11, color: '#6C757D' }}>{format.datetime(detail.createdAt)}</p>
              </div>
              {detail.notes && (
                <div>
                  <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: '#6C757D' }}>Notes</p>
                  <p style={{ fontSize: 11, color: '#212529' }}>{detail.notes}</p>
                </div>
              )}
            </div>

            {/* Right: lines */}
            <div className="flex-1 overflow-auto">
              <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                    {['Product', 'Qty', 'Unit Price', 'Line Total'].map((h) => (
                      <th
                        key={h}
                        className="text-left pb-1"
                        style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6C757D' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid #F1F3F4' }}>
                      <td style={{ padding: '4px 0' }}>
                        <p style={{ fontWeight: 500, color: '#212529' }}>{line.product.name}</p>
                        <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{line.product.code}</p>
                      </td>
                      <td className="font-mono" style={{ padding: '4px 12px 4px 0', color: '#6C757D' }}>
                        {new Decimal(line.quantity).toFixed(3)} {line.product.unit}
                      </td>
                      <td className="font-mono" style={{ padding: '4px 12px 4px 0', color: '#6C757D' }}>
                        R {new Decimal(line.unitPrice).toFixed(2)}
                      </td>
                      <td className="font-mono font-semibold" style={{ padding: '4px 0', color: '#212529' }}>
                        R {new Decimal(line.lineTotal).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid #E0E0E0' }}>
                    <td colSpan={3} className="text-right font-semibold" style={{ padding: '6px 12px 0 0', color: '#6C757D' }}>
                      Total Payout
                    </td>
                    <td className="font-mono font-bold" style={{ padding: '6px 0 0', fontSize: 13, color: '#212529' }}>
                      R {new Decimal(detail.totalAmount).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </InlineDetailPanel>

      {/* Void dialog */}
      {voidTarget && (
        <VoidDialog
          purchase={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => {
            swrMutate(`/api/purchases?${query}`)
            if (selectedId === voidTarget.id) setSelectedId(null)
            setVoidTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Void Dialog ──────────────────────────────────────────────────────────────

function VoidDialog({
  purchase,
  onClose,
  onSuccess,
}: {
  purchase: Purchase
  onClose:  () => void
  onSuccess: () => void
}) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/purchases/${purchase.id}/void`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Purchase voided')
      onSuccess()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to void purchase')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ color: '#C0392B' }}>Void Purchase</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: '#6C757D' }}>
            You are about to void{' '}
            <span className="font-semibold" style={{ color: '#212529' }}>{purchase.refNumber}</span>
            {' '}(R {new Decimal(purchase.totalAmount).toFixed(2)}). This cannot be undone.
          </p>
          <div>
            <Label>Reason for void</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason (min 5 characters)"
              className="mt-1"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={loading || reason.trim().length < 5}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Voiding…</>
                : 'Confirm Void'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
