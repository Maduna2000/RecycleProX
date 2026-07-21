'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Loader2, ToggleLeft, ToggleRight, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import {
  TH, TD, HEADER_GRAD,
  Btn, EmptyHint,
  RpxDialogContent, RpxDialogHeader,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type TradeCommodityOption = {
  id: string
  name: string
  parentId: string | null
  isActive: boolean
}

const QUERY = '/api/settings/trade-commodities'

export function TradeCommoditiesModal({ onClose }: { onClose: () => void }) {
  const [toggling, setToggling] = useState<string | null>(null)

  const { data, isLoading } = useSWR<{ categories: TradeCommodityOption[] }>(QUERY, fetcher)
  const categories = data?.categories ?? []

  // Parent categories first (in their existing Products sort order), each
  // immediately followed by its children, so the tree reads naturally.
  const parents = categories.filter((c) => !c.parentId)
  const rows = parents.flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)])

  async function handleToggle(category: TradeCommodityOption) {
    setToggling(category.id)
    const res = await fetch(`${QUERY}/${category.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !category.isActive }),
    })
    setToggling(null)
    if (res.ok) {
      toast.success(category.isActive ? 'Removed from Trade Commodities' : 'Added to Trade Commodities')
      mutate(QUERY)
    } else {
      toast.error('Failed to update category')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={640} style={{ maxHeight: '80vh' }}>
        <RpxDialogHeader
          title={`Trade Commodities (${categories.filter((c) => c.isActive).length} active)`}
          onClose={onClose}
        />

        {/* Help text + Manage Categories — merged into one row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#FAFAFA', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: '#6C757D', flex: 1, margin: 0 }}>
            Sourced from Products &rarr; Categories. Toggle the ones customers can select when registering an account.
          </p>
          <Btn size="sm" icon={Package} href="/app/products" style={{ whiteSpace: 'nowrap' }}>
            Manage Categories
          </Btn>
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <EmptyHint text="No product categories yet. Create some in Products → Manage Categories first." height={100} />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                  <th style={{ ...TH, height: 24 }}>Category</th>
                  <th style={{ ...TH, height: 24, width: 90 }}>Status</th>
                  <th style={{ ...TH, height: 24, width: 120, textAlign: 'center' }}>Trade Commodity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr
                    key={c.id}
                    style={{
                      background: i % 2 === 1 ? '#FAFAFA' : '#fff',
                      borderBottom: '1px solid #F0F0F0',
                      height: 26,
                    }}
                  >
                    <td style={{ ...TD, padding: '1px 8px', fontWeight: c.parentId ? 400 : 500, paddingLeft: c.parentId ? 26 : 8 }}>
                      {c.parentId && <span style={{ color: '#ABABAB', marginRight: 4 }}>&#8618;</span>}
                      {c.name}
                    </td>
                    <td style={{ ...TD, padding: '1px 8px' }}>
                      <span style={{
                        display: 'inline-flex',
                        padding: '0px 5px',
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        ...(c.isActive
                          ? { background: colors.actionBg, color: colors.action }
                          : { background: colors.neutralBg, color: colors.textSecondary }
                        ),
                      }}>
                        {c.isActive ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ ...TD, padding: '1px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleToggle(c)}
                        disabled={toggling === c.id}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: 2, border: 'none', background: 'transparent',
                          cursor: 'pointer', color: c.isActive ? colors.action : '#6C757D',
                          opacity: toggling === c.id ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E0E0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        title={c.isActive ? 'Remove from Trade Commodities' : 'Add to Trade Commodities'}
                      >
                        {c.isActive ? <ToggleRight style={{ width: 17, height: 17 }} /> : <ToggleLeft style={{ width: 17, height: 17 }} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </RpxDialogContent>
    </Dialog>
  )
}
