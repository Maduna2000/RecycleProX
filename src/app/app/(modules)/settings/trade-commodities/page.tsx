'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Plus, Loader2, GripVertical, Pencil, Trash2, ArrowLeft, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateTradeCommodityCategorySchema, type CreateTradeCommodityCategoryInput, type CreateTradeCommodityCategoryFormInput } from '@/lib/schemas/tradeCommodity'
import { colors } from '@/lib/design-tokens'
import { Dialog } from '@/components/ui/dialog'
import {
  inp, lbl, TH, TD, HEADER_GRAD,
  Btn, PortalPage, EmptyHint,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type TradeCommodityCategory = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

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

    const newOrder = [...categories]
    const [moved] = newOrder.splice(fromIndex, 1)
    if (!moved) {
      setDraggedId(null)
      return
    }
    newOrder.splice(toIndex, 0, moved)
    const orderedIds = newOrder.map((c) => c.id)

    setDraggedId(null)

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
    <>
    <PortalPage
      title={`Trade Commodities (${categories.filter((c) => c.isActive).length} active)`}
      actions={
        <>
          <Btn size="sm" icon={ArrowLeft} href="/app/settings">Settings</Btn>
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Add Category</Btn>
        </>
      }
    >
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
            <EmptyHint text='No categories created yet. Click "Add Category" to get started.' height={120} />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
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
    </PortalPage>

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
    </>
  )
}

function CreateCategoryModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<CreateTradeCommodityCategoryFormInput, unknown, CreateTradeCommodityCategoryInput>({
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
      <RpxDialogContent maxWidth={400}>
        <RpxDialogHeader title="New Trade Commodity Category" onClose={onClose} />
        <form onSubmit={handleSubmit(onSubmit)}>
          <RpxDialogBody>
            <span style={lbl}>Category Name</span>
            <input
              {...register('name')}
              style={inp}
              placeholder="e.g. Copper, Aluminium, E-Waste"
              disabled={loading}
              autoFocus
            />
            {errors.name && <p style={{ fontSize: 10, color: colors.danger, marginTop: 3 }}>{errors.name.message}</p>}
          </RpxDialogBody>
          <RpxDialogFooter>
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn variant="primary" type="submit" loading={loading}>
              {loading ? 'Creating…' : 'Create'}
            </Btn>
          </RpxDialogFooter>
        </form>
      </RpxDialogContent>
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
  const { register, handleSubmit, formState: { errors } } = useForm<CreateTradeCommodityCategoryFormInput, unknown, CreateTradeCommodityCategoryInput>({
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
      <RpxDialogContent maxWidth={400}>
        <RpxDialogHeader title="Edit Category" onClose={onClose} />
        <form onSubmit={handleSubmit(onSubmit)}>
          <RpxDialogBody>
            <span style={lbl}>Category Name</span>
            <input
              {...register('name')}
              style={inp}
              disabled={loading}
              autoFocus
            />
            {errors.name && <p style={{ fontSize: 10, color: colors.danger, marginTop: 3 }}>{errors.name.message}</p>}
          </RpxDialogBody>
          <RpxDialogFooter>
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn variant="primary" type="submit" loading={loading}>
              {loading ? 'Saving…' : 'Save Changes'}
            </Btn>
          </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}
