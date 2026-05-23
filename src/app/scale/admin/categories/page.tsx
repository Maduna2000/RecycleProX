'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, X, Package } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Category {
  id: string; name: string; description: string | null; colorHex: string | null
  iconName: string | null; sortOrder: number; isActive: boolean
  _count?: { products: number }
}

interface FormState {
  name: string; description: string; colorHex: string; iconName: string; sortOrder: number
}

const PRESET_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#6366f1','#a855f7','#ec4899','#6b7280']
const PRESET_ICONS  = ['Package','Recycle','Truck','Factory','Zap','Leaf','Archive','Box','Layers','Database']

function CategoryIcon({ iconName, className }: { iconName: string | null; className?: string }) {
  if (!iconName) return <Package className={className ?? 'w-6 h-6 text-white'} />
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName]
  return Icon ? <Icon className={className ?? 'w-6 h-6 text-white'} /> : <Package className={className ?? 'w-6 h-6 text-white'} />
}

const EMPTY: FormState = { name: '', description: '', colorHex: '#6b7280', iconName: 'Package', sortOrder: 0 }

export default function CategoriesPage() {
  const qc = useQueryClient()
  const [modal, setModal]   = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm]     = useState<FormState>(EMPTY)

  const { data: categories = [], isFetching } = useQuery<Category[]>({
    queryKey: ['scale-categories-admin'],
    queryFn: () => fetch('/api/scale/categories?includeInactive=true').then(r => r.json()),
  })

  const createMut = useMutation({
    mutationFn: (data: FormState) =>
      fetch('/api/scale/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scale-categories-admin'] }); setModal(null) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormState> & { isActive?: boolean } }) =>
      fetch(`/api/scale/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scale-categories-admin'] }); setModal(null) },
  })

  function openCreate() { setForm(EMPTY); setModal('create') }
  function openEdit(cat: Category) {
    setEditing(cat)
    setForm({ name: cat.name, description: cat.description ?? '', colorHex: cat.colorHex ?? '#6b7280', iconName: cat.iconName ?? 'Package', sortOrder: cat.sortOrder })
    setModal('edit')
  }

  function handleSubmit() {
    if (modal === 'create') createMut.mutate(form)
    else if (modal === 'edit' && editing) updateMut.mutate({ id: editing.id, data: form })
  }

  const isLoading = createMut.isPending || updateMut.isPending

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
        <button onClick={openCreate} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {isFetching && <div className="h-1 bg-emerald-500 rounded animate-pulse" />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {categories.map(cat => (
          <div key={cat.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${!cat.isActive ? 'opacity-60' : ''}`}>
            <div className="h-16 flex items-center justify-center" style={{ backgroundColor: cat.colorHex ?? '#6b7280' }}>
              <CategoryIcon iconName={cat.iconName} className="w-8 h-8 text-white" />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-slate-800">{cat.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${cat.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {cat.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {cat.description && <p className="text-slate-500 text-sm mb-2 line-clamp-2">{cat.description}</p>}
              <p className="text-slate-400 text-xs mb-3">{cat._count?.products ?? 0} products</p>
              <div className="flex gap-2">
                <button onClick={() => openEdit(cat)} className="flex-1 flex items-center justify-center gap-1 border border-slate-200 rounded-lg py-1.5 text-sm hover:bg-slate-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => updateMut.mutate({ id: cat.id, data: { isActive: !cat.isActive } })}
                  className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  title={cat.isActive ? 'Deactivate' : 'Activate'}
                >
                  {cat.isActive ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
            </div>
          </div>
        ))}
        {categories.length === 0 && !isFetching && (
          <p className="col-span-full text-center text-slate-400 py-12">No categories yet. Add one to get started.</p>
        )}
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">{modal === 'create' ? 'Add Category' : 'Edit Category'}</h3>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-4 mb-5 p-3 bg-slate-50 rounded-xl">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: form.colorHex }}>
                <CategoryIcon iconName={form.iconName} className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">{form.name || 'Category name'}</p>
                <p className="text-slate-400 text-xs">Preview</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Ferrous Metals" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Optional" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Colour</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, colorHex: c }))}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${form.colorHex === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_ICONS.map(icon => {
                    const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[icon]
                    return Icon ? (
                      <button key={icon} onClick={() => setForm(f => ({ ...f, iconName: icon }))}
                        className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all ${form.iconName === icon ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        <Icon className="w-5 h-5 text-slate-600" />
                      </button>
                    ) : null
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Sort Order</label>
                <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} className="w-24 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim() || isLoading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {modal === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
