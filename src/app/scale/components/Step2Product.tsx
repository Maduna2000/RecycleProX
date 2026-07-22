'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Loader2, Package, WifiOff, X } from 'lucide-react'
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
  /** Called once the user has built their list and taps Continue. */
  onContinue: (products: SelectedProduct[]) => void
}

type NavStep = 'categories' | 'subcategories' | 'products'

const FALLBACK_COLOR = '#6b7280'

function CategoryIcon({ iconName, color, size = 20 }: { iconName: string | null; color: string; size?: number }) {
  const Icon = iconName ? (LucideIcons as unknown as Record<string, LucideIcon>)[iconName] : undefined
  const Resolved = Icon ?? Package
  return <Resolved style={{ width: size, height: size, color }} strokeWidth={2} />
}

export default function Step2Product({ onContinue }: Props) {
  const [categories,   setCategories]   = useState<Category[]>([])
  const [products,     setProducts]     = useState<Product[]>([])
  const [selectedCat,  setSelectedCat]  = useState<Category | null>(null)
  const [selectedSub,  setSelectedSub]  = useState<SubCategory | null>(null)
  const [navStep,      setNavStep]      = useState<NavStep>('categories')
  const [loading,      setLoading]      = useState(true)
  const [picked,       setPicked]       = useState<Map<string, SelectedProduct>>(new Map())
  const [showSummary,  setShowSummary]  = useState(false)
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

  function toggleProduct(p: Product, categoryName: string, categoryId: string) {
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(p.id)) next.delete(p.id)
      else next.set(p.id, { id: p.id, name: p.name, unit: p.unit, categoryName, categoryId })
      return next
    })
  }

  function removePicked(id: string) {
    setPicked((prev) => { const next = new Map(prev); next.delete(id); return next })
  }

  const pickedList = useMemo(() => Array.from(picked.values()), [picked])
  const activeCat = selectedSub ?? selectedCat
  const activeColor = activeCat?.colorHex ?? FALLBACK_COLOR

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-5 max-w-lg lg:max-w-2xl mx-auto w-full">

        {loading && navStep === 'categories' && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        )}

        {/* ── Category grid ─────────────────────────────────────────────── */}
        {!loading && navStep === 'categories' && (
          <>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Select Material</h2>
            <p className="text-slate-500 text-sm mb-4">
              Add everything the customer is bringing in — you can pick more than one
            </p>

            {!isOnline && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-amber-700 text-sm">Offline — using cached data</span>
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {categories.map((cat) => {
                const color = cat.colorHex ?? FALLBACK_COLOR
                const count = cat._count?.products ?? 0
                return (
                  <button
                    key={cat.id}
                    onClick={() => void selectCategory(cat)}
                    className="relative flex flex-col items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 pt-4 pb-3 active:scale-95 transition-all hover:border-slate-300 hover:shadow-sm text-center overflow-hidden"
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color }} />
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}17` }}>
                      <CategoryIcon iconName={cat.iconName} color={color} />
                    </span>
                    <span className="font-semibold text-slate-700 text-[12.5px] leading-tight">{cat.name}</span>
                    <span className="text-slate-400 text-[10.5px]">
                      {cat.children.length > 0
                        ? `${cat.children.length} type${cat.children.length !== 1 ? 's' : ''}`
                        : `${count} item${count !== 1 ? 's' : ''}`}
                    </span>
                  </button>
                )
              })}
            </div>

            {categories.length === 0 && (
              <p className="text-center text-slate-400 mt-12">No categories configured. Contact your administrator.</p>
            )}
          </>
        )}

        {/* ── Sub-category grid ─────────────────────────────────────────── */}
        {navStep === 'subcategories' && selectedCat && (
          <>
            <button onClick={goBack} className="flex items-center gap-1 text-slate-500 text-sm mb-4 self-start min-h-[44px] px-2 -ml-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Categories
            </button>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeColor }} />
              <h2 className="text-xl font-bold text-slate-800">{selectedCat.name}</h2>
            </div>
            <p className="text-slate-500 text-sm mb-4">Select type</p>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {selectedCat.children.map((sub) => {
                const hasProducts = (sub._count?.products ?? 0) > 0
                const color = sub.colorHex ?? selectedCat.colorHex ?? FALLBACK_COLOR
                return (
                  <button
                    key={sub.id}
                    onClick={() => hasProducts ? void selectSubCategory(sub) : undefined}
                    disabled={!hasProducts}
                    className={`relative flex flex-col items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 pt-4 pb-3 active:scale-95 transition-all text-center overflow-hidden ${!hasProducts ? 'opacity-40 cursor-not-allowed' : 'hover:border-slate-300 hover:shadow-sm'}`}
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color }} />
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}17` }}>
                      <CategoryIcon iconName={sub.iconName ?? selectedCat.iconName} color={color} />
                    </span>
                    <span className="font-semibold text-slate-700 text-[12.5px] leading-tight">{sub.name}</span>
                    <span className="text-slate-400 text-[10.5px]">
                      {hasProducts ? `${sub._count!.products} item${sub._count!.products !== 1 ? 's' : ''}` : 'No products'}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* ── Product list ──────────────────────────────────────────────── */}
        {navStep === 'products' && activeCat && (
          <>
            <button onClick={goBack} className="flex items-center gap-1 text-slate-500 text-sm mb-4 self-start min-h-[44px] px-2 -ml-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4" /> {selectedSub ? selectedCat!.name : 'Categories'}
            </button>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeColor }} />
              <h2 className="text-xl font-bold text-slate-800">{activeCat.name}</h2>
            </div>
            <p className="text-slate-500 text-sm mb-5">Tap to add — pick as many as you need</p>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
            ) : products.length === 0 ? (
              <p className="text-center text-slate-400 py-12">No products in this category</p>
            ) : (
              <div className="flex flex-col gap-2">
                {products.map((p) => {
                  const isPicked = picked.has(p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProduct(p, activeCat.name, activeCat.id)}
                      style={{ borderLeftColor: activeColor, borderLeftWidth: 4 }}
                      className={`flex items-center gap-3 w-full text-left bg-white border rounded-lg px-3 py-3 transition-all active:scale-[0.99] min-h-[56px] ${isPicked ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-400' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <span
                        className="flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 transition-colors"
                        style={{ borderColor: isPicked ? '#059669' : '#CBD5E1', backgroundColor: isPicked ? '#059669' : 'transparent' }}
                      >
                        {isPicked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-slate-800 text-[15px] truncate">{p.name}</span>
                        <span className="block text-slate-400 text-xs">{p.unit}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Selection bar ───────────────────────────────────────────────── */}
      {pickedList.length > 0 && (
        <div className="shrink-0 border-t border-slate-200 bg-white">
          {showSummary && (
            <div className="max-h-40 overflow-y-auto border-b border-slate-100 px-4 py-1.5 max-w-lg lg:max-w-2xl mx-auto w-full">
              {pickedList.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-slate-700 truncate">
                    {item.name} <span className="text-slate-400 text-xs">· {item.categoryName}</span>
                  </span>
                  <button onClick={() => removePicked(item.id)} className="text-slate-400 hover:text-red-500 p-1 shrink-0" aria-label={`Remove ${item.name}`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 px-5 py-3 max-w-lg lg:max-w-2xl mx-auto w-full">
            <button onClick={() => setShowSummary((s) => !s)} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 min-h-[44px]">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0">
                {pickedList.length}
              </span>
              selected
              {showSummary ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onContinue(pickedList)}
              className="ml-auto bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold h-12 px-6 rounded-xl transition-colors shadow-sm shadow-emerald-600/20"
            >
              Continue →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
