'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2, Package } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Category {
  id: string; name: string; colorHex: string | null; iconName: string | null
  _count?: { products: number }
}

interface Product {
  id: string; name: string; unit: string; categoryId: string
}

export interface SelectedProduct {
  id: string; name: string; unit: string; categoryId: string; categoryName: string
}

interface Props {
  onSelect: (product: SelectedProduct) => void
}

function CategoryIcon({ iconName }: { iconName: string | null }) {
  if (!iconName) return <Package className="w-7 h-7 text-white" />
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName]
  return Icon ? <Icon className="w-7 h-7 text-white" /> : <Package className="w-7 h-7 text-white" />
}

export default function Step2Product({ onSelect }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts]     = useState<Product[]>([])
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/scale/categories')
      .then(r => r.json())
      .then(data => setCategories(data))
      .finally(() => setLoading(false))
  }, [])

  async function selectCategory(cat: Category) {
    setSelectedCat(cat)
    setLoading(true)
    const res = await fetch(`/api/scale/products?categoryId=${cat.id}`)
    const data = await res.json()
    setProducts(data)
    setLoading(false)
  }

  if (loading && !selectedCat) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  // ── Product list ───────────────────────────────────────────────────────────
  if (selectedCat) {
    return (
      <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
        <button onClick={() => { setSelectedCat(null); setProducts([]) }} className="text-slate-500 text-sm mb-4 flex items-center gap-1 self-start">
          <ArrowLeft className="w-4 h-4" /> Categories
        </button>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">{selectedCat.name}</h2>
        <p className="text-slate-500 mb-5">Select a product</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
        ) : products.length === 0 ? (
          <p className="text-center text-slate-400 py-12">No products in this category</p>
        ) : (
          <div className="flex flex-col gap-3">
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect({ id: p.id, name: p.name, unit: p.unit, categoryId: p.categoryId, categoryName: selectedCat.name })}
                className="flex items-center justify-between bg-white rounded-xl shadow-sm p-4 border-2 border-transparent hover:border-emerald-500 active:scale-95 transition-all text-left"
              >
                <div>
                  <div className="font-semibold text-slate-800 text-lg">{p.name}</div>
                  <div className="text-slate-500 text-sm">{p.unit}</div>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: selectedCat.colorHex ?? '#6b7280' }}>
                  <CategoryIcon iconName={selectedCat.iconName} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Category grid ──────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col p-5">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Select Category</h2>
      <p className="text-slate-500 mb-5">Choose the type of material</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => selectCategory(cat)}
            className="rounded-2xl shadow-md p-5 flex flex-col items-center gap-3 active:scale-95 transition-all min-h-[120px] justify-center"
            style={{ backgroundColor: cat.colorHex ?? '#6b7280' }}
          >
            <CategoryIcon iconName={cat.iconName} />
            <span className="font-semibold text-white text-center leading-tight">{cat.name}</span>
            {cat._count && (
              <span className="text-white/70 text-xs">{cat._count.products} products</span>
            )}
          </button>
        ))}
      </div>

      {categories.length === 0 && (
        <p className="text-center text-slate-400 mt-12">No categories configured. Contact your administrator.</p>
      )}
    </div>
  )
}
