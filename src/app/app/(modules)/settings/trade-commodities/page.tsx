'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, ToggleLeft, ToggleRight, Package } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'
import {
  TH, TD, HEADER_GRAD,
  Btn, PortalPage, EmptyHint,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type TradeCommodityOption = {
  id: string
  name: string
  parentId: string | null
  isActive: boolean
}

const QUERY = '/api/settings/trade-commodities'

export default function TradeCommoditiesPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

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

  if (!isManager) {
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', fontSize: 13, color: colors.textSecondary }}>
        Access restricted to administrators and managers.
      </div>
    )
  }

  return (
    <PortalPage
      title={`Trade Commodities (${categories.filter((c) => c.isActive).length} active)`}
      actions={
        <>
          <Btn size="sm" icon={ArrowLeft} href="/app/settings">Settings</Btn>
          <Btn size="sm" icon={Package} href="/app/products">Manage Categories</Btn>
        </>
      }
    >
      {/* Help text */}
      <div style={{ padding: '8px 12px', background: '#FAFAFA', borderBottom: '1px solid #E0E0E0', fontSize: 11, color: '#6C757D' }}>
        Trade commodities are sourced directly from your Products &rarr; Categories — every active category is
        listed below. Toggle the ones a customer should be able to select when registered as an account; only
        toggled-on categories appear on the account creation form, and selecting one there limits the Purchases
        product picker to just that category. To add, rename, or remove a category itself, use{' '}
        <strong>Manage Categories</strong> in the Products module.
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: colors.textSecondary }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyHint text="No product categories yet. Create some in Products → Manage Categories first." height={120} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                <th style={TH}>Category</th>
                <th style={{ ...TH, width: 100 }}>Status</th>
                <th style={{ ...TH, width: 140, textAlign: 'center' }}>Trade Commodity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    background: i % 2 === 1 ? '#FAFAFA' : '#fff',
                    borderBottom: '1px solid #F0F0F0',
                    height: 34,
                  }}
                >
                  <td style={{ ...TD, fontWeight: c.parentId ? 400 : 500, paddingLeft: c.parentId ? 28 : 10 }}>
                    {c.parentId && <span style={{ color: '#ABABAB', marginRight: 4 }}>&#8618;</span>}
                    {c.name}
                  </td>
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
                      {c.isActive ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <button
                      onClick={() => handleToggle(c)}
                      disabled={toggling === c.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: 2, border: 'none', background: 'transparent',
                        cursor: 'pointer', color: c.isActive ? colors.action : '#6C757D',
                        opacity: toggling === c.id ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E0E0')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      title={c.isActive ? 'Remove from Trade Commodities' : 'Add to Trade Commodities'}
                    >
                      {c.isActive ? <ToggleRight style={{ width: 18, height: 18 }} /> : <ToggleLeft style={{ width: 18, height: 18 }} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalPage>
  )
}
