'use client'

import { useRef, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { winBevel } from '@/components/rpx'

export type PickerProduct = {
  id: string
  name: string
  unit: string
  category: string
}

/**
 * Product dropdown that opens onto categories first (collapsed) — pressing a
 * category expands it in place to reveal its products, rather than dumping
 * every product from every category into one long flat list.
 */
export function ProductCategoryPicker({
  products,
  value,
  onChange,
  placeholder = 'Select…',
  style,
}: {
  products: PickerProduct[]
  value: string
  onChange: (productId: string) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selected = products.find((p) => p.id === value) ?? null

  const byCategory = products.reduce<Record<string, PickerProduct[]>>((acc, p) => {
    acc[p.category] = acc[p.category] ?? []
    acc[p.category]!.push(p)
    return acc
  }, {})
  const categories = Object.keys(byCategory).sort()

  function handleOpen() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const estimatedH = 320
      const openUpward = rect.bottom + estimatedH > window.innerHeight - 8
      setPos({
        top:    openUpward ? undefined : rect.bottom + 2,
        bottom: openUpward ? window.innerHeight - rect.top + 2 : undefined,
        left:   rect.left,
        width:  Math.max(rect.width, 240),
      })
    }
    // Auto-expand the selected product's category so it's visible immediately
    setExpandedCat(selected?.category ?? null)
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
    setPos(null)
  }

  function selectProduct(p: PickerProduct) {
    onChange(p.id)
    handleClose()
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? handleClose() : handleOpen())}
        style={{
          height: 24, width: '100%', borderRadius: 2,
          padding: '0 4px', fontSize: 11, color: '#212529',
          background: '#fff', outline: 'none', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          cursor: 'pointer',
          ...winBevel(true),
          ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? `${selected.name} (${selected.unit})` : placeholder}
        </span>
        <ChevronDown style={{ width: 11, height: 11, color: '#6C757D', flexShrink: 0 }} />
      </button>

      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={handleClose} />
          <div
            style={{
              position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width,
              zIndex: 50, background: '#fff', borderRadius: 3,
              boxShadow: '2px 2px 6px rgba(0,0,0,0.3)', maxHeight: 320, overflowY: 'auto',
              ...winBevel(),
            }}
          >
            {categories.length === 0 ? (
              <p style={{ padding: '10px 12px', fontSize: 11, color: '#9CA3AF' }}>No products available</p>
            ) : (
              categories.map((cat) => {
                const isExpanded = expandedCat === cat
                const prods = byCategory[cat]!
                return (
                  <div key={cat}>
                    <button
                      type="button"
                      onClick={() => setExpandedCat(isExpanded ? null : cat)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, width: '100%',
                        padding: '5px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: '#6C757D', background: isExpanded ? '#EBF3FC' : '#F0F0F0',
                        border: 'none', borderTop: '1px solid #E0E0E0', borderBottom: '1px solid #E0E0E0',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      {isExpanded
                        ? <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
                        : <ChevronRight style={{ width: 11, height: 11, flexShrink: 0 }} />}
                      <span style={{ flex: 1 }}>{cat}</span>
                      <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{prods.length}</span>
                    </button>
                    {isExpanded && prods.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '5px 12px 5px 26px', fontSize: 11,
                          color: p.id === value ? '#185ABD' : '#212529',
                          fontWeight: p.id === value ? 600 : 400,
                          background: p.id === value ? '#EBF3FC' : (i % 2 === 1 ? '#FAFAFA' : '#fff'),
                          border: 'none', borderBottom: '1px solid #F5F5F5',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { if (p.id !== value) e.currentTarget.style.background = '#EBF3FC' }}
                        onMouseLeave={(e) => { if (p.id !== value) e.currentTarget.style.background = i % 2 === 1 ? '#FAFAFA' : '#fff' }}
                      >
                        {p.name} <span style={{ color: '#9CA3AF', fontSize: 10 }}>({p.unit})</span>
                      </button>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
