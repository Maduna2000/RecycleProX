'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Pencil, Copy, Printer, MonitorCheck, Trash2, ReceiptText, Upload, X, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/dialog'
import { colors, fontSize } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import {
  Btn, Field, FilterBar, inp, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

type PriceListRow = {
  id: string
  title: string
  listDate: string
  isActiveForPurchases: boolean
  updatedAt: string
  priceGroupId: string
  priceGroup: { name: string }
  _count: { items: number }
}

type PriceGroupOption = { id: string; name: string; isDefault: boolean }

const LISTS_KEY = '/api/price-lists'
const LOGO_KEY = '/api/price-lists/logo'

export default function PriceListsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [deleteTarget, setDeleteTarget] = useState<PriceListRow | null>(null)
  const [priceGroupFilter, setPriceGroupFilter] = useState('')

  const { data: priceGroupsData } = useSWR<{ groups: PriceGroupOption[] }>('/api/price-groups', fetcher)
  const priceGroups = priceGroupsData?.groups ?? []

  const listsKey = priceGroupFilter ? `${LISTS_KEY}?priceGroupId=${priceGroupFilter}` : LISTS_KEY
  const { data, isLoading } = useSWR<{ priceLists: PriceListRow[] }>(listsKey, fetcher)
  const priceLists = data?.priceLists ?? []

  // Client-side pagination — same pattern as Products/Price Groups/Users,
  // and the only thing DataTable needs to render its "Showing X–Y of Z"
  // footer bar, which this page was previously missing entirely.
  const [page, setPage] = useState(1)
  const PAGE_SIZE  = 30
  const totalPages = Math.max(1, Math.ceil(priceLists.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pagedPriceLists = priceLists.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [priceGroupFilter])

  async function handleActivate(row: PriceListRow) {
    const res = await fetch(`/api/price-lists/${row.id}/activate`, { method: 'POST' })
    if (res.ok) { toast.success(`"${row.title}" now shows under Purchases`); mutate(LISTS_KEY) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to activate') }
  }

  async function handleDuplicate(row: PriceListRow) {
    const res = await fetch(`/api/price-lists/${row.id}/duplicate`, { method: 'POST' })
    if (res.ok) {
      const copy = await res.json()
      toast.success('Price list duplicated')
      mutate(LISTS_KEY)
      router.push(`/app/products/price-lists/${copy.id}`)
    } else {
      const j = await res.json(); toast.error(j.error ?? 'Failed to duplicate')
    }
  }

  const columns: Column<PriceListRow>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (r) => (
        <span style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary }}>{r.title}</span>
      ),
    },
    {
      key: 'listDate',
      header: 'Date',
      width: '110px',
      render: (r) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {new Date(r.listDate).toLocaleDateString('en-ZA', { timeZone: 'UTC' })}
        </span>
      ),
    },
    {
      key: 'priceGroup',
      header: 'Price Group',
      width: '120px',
      render: (r) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.priceGroup.name}</span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      width: '70px',
      align: 'right',
      render: (r) => (
        <span className="font-mono" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{r._count.items}</span>
      ),
    },
    {
      key: 'active',
      header: 'Shown in Purchases',
      width: '170px',
      render: (r) => r.isActiveForPurchases ? (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: colors.actionBg, color: colors.action }}
        >
          Today&apos;s List · {r.priceGroup.name}
        </span>
      ) : null,
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      width: '140px',
      render: (r) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {new Date(r.updatedAt).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
  ]

  const rowActions: RowAction<PriceListRow>[] = [
    {
      label:   'Edit',
      icon:    Pencil,
      hidden:  () => !isManager,
      onClick: (r) => router.push(`/app/products/price-lists/${r.id}`),
    },
    {
      label:   'Print / PDF',
      icon:    Printer,
      onClick: (r) => window.open(`/api/price-lists/${r.id}/pdf`, '_blank'),
    },
    {
      label:   'Duplicate',
      icon:    Copy,
      hidden:  () => !isManager,
      onClick: handleDuplicate,
    },
    {
      label:   'Set as Today’s List',
      icon:    MonitorCheck,
      hidden:  (r) => !isManager || r.isActiveForPurchases,
      onClick: handleActivate,
    },
    {
      label:   'Delete',
      icon:    Trash2,
      danger:  true,
      hidden:  () => !isManager,
      onClick: (r) => setDeleteTarget(r),
    },
  ]

  return (
    <PortalPage title="Price Lists">
      {isManager && <LogoCard />}

      <FilterBar>
        <Field label="Price Group" width={160}>
          <select
            value={priceGroupFilter}
            onChange={(e) => setPriceGroupFilter(e.target.value)}
            style={inp}
          >
            <option value="">All Price Groups</option>
            {priceGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}{g.isDefault ? ' (Default)' : ''}</option>
            ))}
          </select>
        </Field>
      </FilterBar>

      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={pagedPriceLists}
          rowKey={(r) => r.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No price lists yet"
          emptyIcon={ReceiptText}
          emptyAction={isManager ? {
            label: 'Create your first price list',
            onClick: () => router.push('/app/products/price-lists/new'),
          } : undefined}
          total={priceLists.length}
          page={safePage}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>

      {deleteTarget && (
        <DeletePriceListModal
          priceList={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => { mutate(LISTS_KEY); setDeleteTarget(null) }}
        />
      )}
    </PortalPage>
  )
}

// ─── Saved logo card ──────────────────────────────────────────────────────────

function LogoCard() {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data } = useSWR<{ key: string | null; url: string | null }>(LOGO_KEY, fetcher)

  async function handleUpload(file: File) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('context', 'price_list_logo')
      fd.append('referenceId', crypto.randomUUID())
      fd.append('file', file)
      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) {
        const j = await uploadRes.json()
        toast.error(j.error ?? 'Logo upload failed')
        return
      }
      const { key } = await uploadRes.json()
      const saveRes = await fetch(LOGO_KEY, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ r2Key: key }),
      })
      if (saveRes.ok) { toast.success('Logo saved'); mutate(LOGO_KEY) }
      else { const j = await saveRes.json(); toast.error(j.error ?? 'Failed to save logo') }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemove() {
    setBusy(true)
    const res = await fetch(LOGO_KEY, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) { toast.success('Logo removed'); mutate(LOGO_KEY) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to remove logo') }
  }

  return (
    <div
      className="flex items-center gap-3 shrink-0"
      style={{ margin: '10px 10px 0', padding: '8px 12px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2 }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 120, height: 48, border: `1px dashed ${colors.border}`, borderRadius: 2, background: colors.bg, overflow: 'hidden' }}
      >
        {data?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.url} alt="Price list logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <ImageIcon style={{ width: 18, height: 18, color: colors.textMuted }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary }}>Price list logo</p>
        <p style={{ fontSize: 11, color: colors.textMuted }}>
          PNG or JPG, max 2 MB. Printed at a fixed height with its aspect ratio kept — tall or very wide art is scaled down automatically.
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
        disabled={busy}
      />
      <Btn size="sm" icon={Upload} onClick={() => fileRef.current?.click()} disabled={busy}>
        {data?.url ? 'Replace' : 'Upload'}
      </Btn>
      {data?.url && (
        <Btn size="sm" icon={X} onClick={handleRemove} disabled={busy}>Remove</Btn>
      )}
    </div>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeletePriceListModal({ priceList, onClose, onSuccess }: {
  priceList: PriceListRow
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    setLoading(true)
    const res = await fetch(`/api/price-lists/${priceList.id}`, { method: 'DELETE' })
    setLoading(false)
    if (res.ok) { toast.success('Price list deleted'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title="Delete Price List" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: 0 }}>
            Delete <span style={{ fontWeight: 600, color: colors.textPrimary }}>{priceList.title}</span> (
            {new Date(priceList.listDate).toLocaleDateString('en-ZA', { timeZone: 'UTC' })})?
            {priceList.isActiveForPurchases && (
              <> It is currently shown under Purchases — the panel will be empty until another list is selected.</>
            )}
            {' '}This cannot be undone.
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
