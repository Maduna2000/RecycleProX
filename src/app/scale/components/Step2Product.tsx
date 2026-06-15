'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2, Package, WifiOff } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useScaleCache } from '@/hooks/useScaleCache'

interface SubCategory {
  id: string; name: string; colorHex: string | null; iconName: string | null
  _count?: { products: number }
}

interface Category {
  id: string; name: string; colorHex: string | null; iconName: string | null
  children: SubCategory[]
  _count?: { products: number }
}

interface Product {
  id: string; name: string; unit: string; category: string
}

export interface SelectedProduct {
  id: string; name: string; unit: string; categoryName: string; categoryId: string
}

interface Props {
  onSelect: (product: SelectedProduct) => void
}

type NavStep = 'categories' | 'subcategories' | 'products'

function CategoryIcon({ iconName }: { iconName: string | null }) {
  if (!iconName) return <Package className="w-7 h-7 text-white" />
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName]
  return Icon ? <Icon className="w-7 h-7 text-white" /> : <Package className="w-7 h-7 text-white" />
}

export default function Step2Product({ onSelect }: Props) {
  const [categories,   setCategories]   = useState<Category[]>([])
  const [products,     setProducts]     = useState<Product[]>([])
  const [selectedCat,  setSelectedCat]  = useState<Category | null>(null)
  const [selectedSub,  setSelectedSub]  = useState<SubCategory | null>(null)
  const [navStep,      setNavStep]      = useState<NavStep>('categories')
  const [loading,      setLoading]      = useState(true)
  const { isOnline, getCategories, getProducts } = useScaleCache()

  useEffect(() => {
    // Use cache-aware fetch (works online and offline)
    getCategories()
      .then((data) => setCategories(data))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchProducts(categoryName: string) {
    setLoading(true)
    // Use cache-aware fetch
    const data = await getProducts(categoryName)
    setProducts(data)
    setLoading(false)
  }

  async function selectCategory(cat: Category) {
    setSelectedCat(cat)
    if (cat.children.length > 0) {
      setNavStep('subcategories')
    } else {
      setNavStep('products')
      await fetchProducts(cat.name)
    }
  }

  async function selectSubCategory(sub: SubCategory) {
    setSelectedSub(sub)
    setNavStep('products')
    await fetchProducts(sub.name)
  }

  function goBack() {
    if (navStep === 'products') {
      setProducts([])
      setSelectedSub(null)
      if (selectedCat && selectedCat.children.length > 0) {
        setNavStep('subcategories')
      } else {
        setSelectedCat(null)
        setNavStep('categories')
      }
    } else if (navStep === 'subcategories') {
      setSelectedCat(null)
      setNavStep('categories')
    }
  }

  if (loading && navStep === 'categories') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  // ── Sub-category grid ──────────────────────────────────────────────────────
  if (navStep === 'subcategories' && selectedCat) {
    return (
      <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
        <button onClick={goBack} className="flex items-center gap-1 text-slate-500 text-sm mb-4 self-start min-h-[44px] px-2 -ml-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Categories
        </button>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">{selectedCat.name}</h2>
        <p className="text-slate-500 mb-5">Select type</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {selectedCat.children.map(sub => {
            const hasProducts = (sub._count?.products ?? 0) > 0
            return (
              <button
                key={sub.id}
                onClick={() => hasProducts ? void selectSubCategory(sub) : undefined}
                disabled={!hasProducts}
                className={`rounded-2xl shadow-md p-5 flex flex-col items-center gap-3 active:scale-95 transition-all min-h-[120px] justify-center ${!hasProducts ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={{ backgroundColor: sub.colorHex ?? selectedCat.colorHex ?? '#6b7280' }}
              >
                <CategoryIcon iconName={sub.iconName ?? selectedCat.iconName} />
                <span className="font-semibold text-white text-center leading-tight">{sub.name}</span>
                {!hasProducts
                  ? <span className="text-white/70 text-xs">No products</span>
                  : sub._count && <span className="text-white/70 text-xs">{sub._count.products} product{sub._count.products !== 1 ? 's' : ''}</span>
                }
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Product list ───────────────────────────────────────────────────────────
  if (navStep === 'products' && selectedCat) {
    const activeCat = selectedSub ?? selectedCat
    return (
      <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
        <button onClick={goBack} className="flex items-center gap-1 text-slate-500 text-sm mb-4 self-start min-h-[44px] px-2 -ml-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {selectedSub ? selectedCat.name : 'Categories'}
        </button>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">{activeCat.name}</h2>
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
                onClick={() => onSelect({ id: p.id, name: p.name, unit: p.unit, categoryName: activeCat.name, categoryId: activeCat.id })}
                className="flex items-center justify-between bg-white rounded-xl shadow-sm p-4 border-2 border-transparent hover:border-emerald-500 active:scale-95 transition-all text-left min-h-[56px]"
              >
                <div>
                  <div className="font-semibold text-slate-800 text-lg">{p.name}</div>
                  <div className="text-slate-500 text-sm">{p.unit}</div>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: activeCat.colorHex ?? '#6b7280' }}>
                  <CategoryIcon iconName={activeCat.iconName} />
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
    <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Select Category</h2>
      <p className="text-slate-500 mb-4">Choose the type of material</p>

      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-amber-700 text-sm">Offline — using cached data</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => void selectCategory(cat)}
            className="rounded-2xl shadow-md p-5 flex flex-col items-center gap-3 active:scale-95 transition-all min-h-[120px] justify-center"
            style={{ backgroundColor: cat.colorHex ?? '#6b7280' }}
          >
            <CategoryIcon iconName={cat.iconName} />
            <span className="font-semibold text-white text-center leading-tight">{cat.name}</span>
            {cat._count && (
              <span className="text-white/70 text-xs">{cat._count.products} product{cat._count.products !== 1 ? 's' : ''}</span>
            )}
            {cat.children.length > 0 && (
              <span className="text-white/60 text-xs">{cat.children.length} type{cat.children.length !== 1 ? 's' : ''}</span>
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
