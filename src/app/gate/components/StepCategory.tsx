'use client'

import { useState, useEffect } from 'react'
import * as LucideIcons from 'lucide-react'
import { Package, Loader2, ArrowRight } from 'lucide-react'

type CategoryNode = {
  id: string
  name: string
  colorHex: string | null
  iconName: string | null
  children: CategoryNode[]
}

interface Props {
  onSelect: (categoryName: string) => void
}

function CatIcon({ name, size = 22 }: { name: string | null; size?: number }) {
  if (!name) return <Package style={{ width: size, height: size }} />
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ style?: React.CSSProperties }>>)[name]
  return Icon ? <Icon style={{ width: size, height: size }} /> : <Package style={{ width: size, height: size }} />
}

export default function StepCategory({ onSelect }: Props) {
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/product-categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  const flat = categories.flatMap((parent) => [parent, ...parent.children])

  return (
    <div className="flex-1 flex flex-col p-5 max-w-2xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">What are they selling?</h2>
      <p className="text-slate-500 mb-5">Select the category</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {flat.map((cat) => {
          const isSel = selected === cat.name
          const bg = cat.colorHex ? `${cat.colorHex}22` : '#F1F5F9'
          const fg = cat.colorHex ?? '#475569'
          return (
            <button
              key={cat.id}
              onClick={() => setSelected(cat.name)}
              className="flex flex-col items-center gap-2 rounded-2xl shadow-md p-4 border-2 transition-all active:scale-95 bg-white"
              style={{ borderColor: isSel ? '#10b981' : 'transparent' }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: bg, color: fg }}>
                <CatIcon name={cat.iconName} />
              </div>
              <span className="font-medium text-slate-800 text-sm text-center">{cat.name}</span>
            </button>
          )
        })}
        {flat.length === 0 && (
          <p className="col-span-full text-center text-slate-400 py-8">No product categories configured yet</p>
        )}
      </div>

      <button
        onClick={() => selected && onSelect(selected)}
        disabled={!selected}
        className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xl font-semibold h-16 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        Continue <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  )
}
