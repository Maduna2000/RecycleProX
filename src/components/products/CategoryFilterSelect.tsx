'use client'

/**
 * Category filter dropdown fed by the real ProductCategory tree
 * (/api/product-categories) instead of hardcoded legacy slugs.
 *
 * Renders parents with their sub-categories indented beneath. Selecting a
 * parent should include products assigned to its children — use the
 * expandCategory helper from useProductCategories for client-side filters
 * (server-side filters expand via productService.expandCategoryNames).
 */
import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'


interface CategoryNode {
  id: string
  name: string
  children: { id: string; name: string }[]
}

export function useProductCategories() {
  const { data } = useSWR<{ categories: CategoryNode[] }>('/api/product-categories', fetcher)
  const categories = data?.categories ?? []

  /** Names matched by a selection: a parent covers itself + its children. */
  function expandCategory(name: string): Set<string> {
    const parent = categories.find((c) => c.name === name)
    if (!parent) return new Set([name])
    return new Set([parent.name, ...parent.children.map((ch) => ch.name)])
  }

  return { categories, expandCategory }
}

interface CategoryFilterSelectProps {
  value: string
  onChange: (name: string) => void
  className?: string
  style?: React.CSSProperties
}

export function CategoryFilterSelect({ value, onChange, className, style }: CategoryFilterSelectProps) {
  const { categories } = useProductCategories()

  return (
    <select className={className} style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All Categories</option>
      {categories.map((parent) => (
        <optgroup key={parent.id} label={parent.name}>
          <option value={parent.name}>{parent.name}{parent.children.length > 0 ? ' (all)' : ''}</option>
          {parent.children.map((child) => (
            <option key={child.id} value={child.name}>{'  '}{child.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
