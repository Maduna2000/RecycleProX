'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { WinButton } from '@/components/ui/WinButton'
import { Plus, Loader2, GripVertical, Pencil, Trash2, ArrowLeft, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateTradeCommodityCategorySchema, type CreateTradeCommodityCategoryInput } from '@/lib/schemas/tradeCommodity'
import { colors } from '@/lib/design-tokens'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type TradeCommodityCategory = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 28,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '0 10px', fontSize: 12, color: '#212529' }

export default function TradeCommoditiesPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [createOpen, setCreateOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<TradeCommodityCategory | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const { data, isLoading } = useSWR<{ categories: TradeCommodityCategory[] }>(
    '/api/settings/trade-commodities?includeInactive=true',
    fetcher
  )
  const categories = data?.categories ?? []

  async function handleToggleActive(category: TradeCommodityCategory) {
    setToggling(category.id)
    const res = await fetch(`/api/settings/trade-commodities/${category.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !category.isActive }),
    })
    setToggling(null)
    if (res.ok) {
      toast.success(category.isActive ? 'Category deactivated' : 'Category activated')
      mutate('/api/settings/trade-commodities?includeInactive=true')
    } else {
      toast.error('Failed to update category')
    }
  }

  async function handleDelete(category: TradeCommodityCategory) {
    if (!confirm(`Are you sure you want to deactivate "${category.name}"?`)) return
    const res = await fetch(`/api/settings/trade-commodities/${category.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Category deactivated')
      mutate('/api/settings/trade-commodities?includeInactive=true')
    } else {
      toast.error('Failed to deactivate category')
    }
  }

  async function handleDragEnd(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }

    const fromIndex = categories.findIndex((c) => c.id === draggedId)
    const toIndex = categories.findIndex((c) => c.id === targetId)
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null)
      return
    }

    // Reorder locally first for immediate feedback
    const newOrder = [...categories]
    const [moved] = newOrder.splice(fromIndex, 1)
    newOrder.splice(toIndex, 0, moved)
    const orderedIds = newOrder.map((c) => c.id)

    setDraggedId(null)

    // Send to API
    const res = await fetch('/api/settings/trade-commodities/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    })

    if (res.ok) {
      mutate('/api/settings/trade-commodities?includeInactive=true')
    } else {
      toast.error('Failed to reorder categories')
    }
  }

  if (!isManager) {
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', fontSize: 13, color: colors.textSecondary }}>
        Access restricted to administrators and managers.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <Link href="/app/settings" style={{ display: 'flex', alignItems: 'center', color: '#6C757D' }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
          </Link>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>Trade Commodity Categories</span>
          <span style={{ fontSize: 11, color: '#6C757D' }}>{categories.filter((c) => c.isActive).length} active</span>
          <div style={{ flex: 1 }} />
          <WinButton onClick={() => setCreateOpen(true)}>
            <Plus style={{ width: 9, height: 9 }} /> Add Category
          </WinButton>
        </div>

        {/* Help text */}
        <div style={{ padding: '8px 12px', background: '#FAFAFA', borderBottom: '1px solid #E0E0E0', fontSize: 11, color: '#6C757D' }}>
          Manage the list of trade commodity categories shown when registering account customers.
          Drag rows to reorder. Categories can be deactivated but not deleted to preserve historical data.
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : categories.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12 }}>
              No categories created yet. Click &quot;Add Category&quot; to get started.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                  <th style={{ ...TH, width: 32 }}></th>
                  <th style={TH}>Name</th>
                  <th style={{ ...TH, width: 80 }}>Status</th>
                  <th style={{ ...TH, width: 100, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr
                    key={c.id}
                    draggable
                    onDragStart={() => setDraggedId(c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDragEnd(e, c.id)}
                    style={{
                      background: draggedId === c.id ? '#E3F2FD' : i % 2 === 1 ? '#FAFAFA' : '#fff',
                      borderBottom: '1px solid #F0F0F0',
                      height: 34,
                      opacity: c.isActive ? 1 : 0.6,
                      cursor: 'grab',
                    }}
                    onMouseEnter={(e) => {
                      if (draggedId !== c.id) e.currentTarget.style.background = '#EEF4FB'
                    }}
                    onMouseLeave={(e) => {
                      if (draggedId !== c.id) e.currentTarget.style.background = i % 2 === 1 ? '#FAFAFA' : '#fff'
                    }}
                  >
                    <td style={{ ...TD, width: 32, textAlign: 'center', cursor: 'grab' }}>
                      <GripVertical style={{ width: 14, height: 14, color: '#ABABAB' }} />
                    </td>
                    <td style={{ ...TD, fontWeight: 500 }}>{c.name}</td>
                    <td style={TD}>
                      <span style={{
                        display: 'inline-flex',
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        ...(c.isActive
                          ? { background: colors.actionBg, color: colors.action }
                          : { background: colors.neutralBg, color: colors.textSecondary }
                        ),
                      }}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <button
                          onClick={() => setEditCategory(c)}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 2, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6C757D' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E0E0')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          title="Edit"
                        >
                          <Pencil style={{ width: 12, height: 12 }} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(c)}
                          disabled={toggling === c.id}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 2, border: 'none', background: 'transparent', cursor: 'pointer', color: c.isActive ? colors.action : '#6C757D', opacity: toggling === c.id ? 0.5 : 1 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E0E0')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          title={c.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {c.isActive ? <ToggleRight style={{ width: 14, height: 14 }} /> : <ToggleLeft style={{ width: 14, height: 14 }} />}
                        </button>
                        {c.isActive && (
                          <button
                            onClick={() => handleDelete(c)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 2, border: 'none', background: 'transparent', cursor: 'pointer', color: colors.danger }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#FEE2E2')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            title="Deactivate"
                          >
                            <Trash2 style={{ width: 12, height: 12 }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateCategoryModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            mutate('/api/settings/trade-commodities?includeInactive=true')
            setCreateOpen(false)
          }}
        />
      )}

      {editCategory && (
        <EditCategoryModal
          category={editCategory}
          onClose={() => setEditCategory(null)}
          onSuccess={() => {
            mutate('/api/settings/trade-commodities?includeInactive=true')
            setEditCategory(null)
          }}
        />
      )}
    </div>
  )
}

function CreateCategoryModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<CreateTradeCommodityCategoryInput>({
    resolver: zodResolver(CreateTradeCommodityCategorySchema),
    defaultValues: { sortOrder: 0 },
  })

  async function onSubmit(data: CreateTradeCommodityCategoryInput) {
    setLoading(true)
    const res = await fetch('/api/settings/trade-commodities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Category created')
      onSuccess()
    } else if (res.status === 409) {
      toast.error('A category with that name already exists')
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to create category')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New Trade Commodity Category</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <Label style={{ color: colors.textPrimary }}>Category Name</Label>
            <Input
              {...register('name')}
              className="mt-1 border-rpx-border"
              placeholder="e.g. Copper, Aluminium, E-Waste"
              disabled={loading}
              autoFocus
            />
            {errors.name && <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.name.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating…</> : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditCategoryModal({
  category,
  onClose,
  onSuccess,
}: {
  category: TradeCommodityCategory
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<CreateTradeCommodityCategoryInput>({
    resolver: zodResolver(CreateTradeCommodityCategorySchema),
    defaultValues: { name: category.name, sortOrder: category.sortOrder },
  })

  async function onSubmit(data: CreateTradeCommodityCategoryInput) {
    setLoading(true)
    const res = await fetch(`/api/settings/trade-commodities/${category.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Category updated')
      onSuccess()
    } else if (res.status === 409) {
      toast.error('A category with that name already exists')
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to update category')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <Label style={{ color: colors.textPrimary }}>Category Name</Label>
            <Input
              {...register('name')}
              className="mt-1 border-rpx-border"
              disabled={loading}
              autoFocus
            />
            {errors.name && <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.name.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
