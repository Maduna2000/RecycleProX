'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, X } from 'lucide-react'

interface Category { id: string; name: string; colorHex: string | null }
interface Product  {
  id: string; name: string; unit: string; isActive: boolean; sortOrder: number
  category: Category
}
interface FormState { categoryId: string; name: string; unit: string; sortOrder: number }

const EMPTY: FormState = { categoryId: '', name: '', unit: 'kg', sortOrder: 0 }

export default function ScaleProductsPage() {
  const qc = useQueryClient()
  const [modal, setModal]   = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm]     = useState<FormState>(EMPTY)
  const [catFilter, setCatFilter] = useState('')

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['scale-categories-list'],
    queryFn: () => fetch('/api/scale/categories?includeInactive=false').then(r => r.json()),
  })

  const { data: products = [], isFetching } = useQuery<Product[]>({
    queryKey: ['scale-products-admin', catFilter],
    queryFn: () => fetch(`/api/scale/products?includeInactive=true${catFilter ? `&categoryId=${catFilter}` : ''}`).then(r => r.json()),
  })

  const createMut = useMutation({
    mutationFn: (data: FormState) =>
      fetch('/api/scale/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scale-products-admin'] }); setModal(null) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormState> & { isActive?: boolean } }) =>
      fetch(`/api/scale/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scale-products-admin'] }); setModal(null) },
  })

  function openEdit(p: Product) {
    setEditing(p)
    setForm({ categoryId: p.category.id, name: p.name, unit: p.unit, sortOrder: p.sortOrder })
    setModal('edit')
  }

  const isLoading = createMut.isPending || updateMut.isPending

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Scale Products</h1>
        <button onClick={() => { setForm(EMPTY); setModal('create') }} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setCatFilter('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!catFilter ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>All</button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setCatFilter(c.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${catFilter === c.id ? 'text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            style={catFilter === c.id ? { backgroundColor: c.colorHex ?? '#6b7280' } : {}}
          >
            {c.name}
          </button>
        ))}
      </div>

      {isFetching && <div className="h-1 bg-emerald-500 rounded animate-pulse" />}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Product Name</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Unit</th>
              <th className="px-4 py-3 text-center">Sort</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map(p => (
              <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${!p.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: p.category.colorHex ?? '#6b7280' }}>
                    {p.category.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 uppercase text-xs">{p.unit}</td>
                <td className="px-4 py-3 text-center text-slate-400">{p.sortOrder}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4 text-slate-500" /></button>
                    <button onClick={() => updateMut.mutate({ id: p.id, data: { isActive: !p.isActive } })} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title={p.isActive ? 'Deactivate' : 'Activate'}>
                      {p.isActive ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && !isFetching && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">{modal === 'create' ? 'Add Product' : 'Edit Product'}</h3>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Category *</label>
                <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Select a category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Product Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Mild Steel" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Unit</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="kg">kg</option>
                  <option value="ton">ton</option>
                  <option value="each">each</option>
                  <option value="litre">litre</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Sort Order</label>
                <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} className="w-24 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => modal === 'create' ? createMut.mutate(form) : (editing && updateMut.mutate({ id: editing.id, data: form }))}
                disabled={!form.name.trim() || !form.categoryId || isLoading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {modal === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
