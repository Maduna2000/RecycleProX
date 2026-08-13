'use client'

import useSWR from 'swr'
import { ReceiptText } from 'lucide-react'
import Decimal from 'decimal.js'
import { fetcher } from '@/lib/swrFetcher'

const VAT_DIVISOR = new Decimal('1.15')

type ActivePriceList = {
  id: string
  title: string
  listDate: string
  showExVat: boolean
  items: { id: string; displayName: string; priceIncVat: string }[]
}

/**
 * Cashier reference panel on the new-purchase screen (right column, below the
 * scales) showing the price list marked "Today's List" in Products → Price
 * Lists. Read-only — prices on the purchase lines are still keyed manually.
 */
export function TodaysPricesPanel() {
  const { data } = useSWR<{ priceList: ActivePriceList | null }>(
    '/api/price-lists/active',
    fetcher,
    { refreshInterval: 5 * 60_000 }, // catch a mid-shift list swap without a reload
  )
  const priceList = data?.priceList

  // Compare calendar dates only — the panel warns when the cashier is
  // looking at yesterday's (or older) prices.
  const isStale = priceList
    ? priceList.listDate.slice(0, 10) < new Date().toISOString().slice(0, 10)
    : false

  return (
    <div style={{ flex: 1, minHeight: 0, padding: '8px 10px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Today&apos;s Prices</span>
        {priceList && (
          <span
            style={{
              fontSize: 10,
              fontWeight: isStale ? 700 : 400,
              color: isStale ? '#B45309' : '#6C757D',
            }}
            title={isStale ? 'This price list is older than today — check with a manager' : undefined}
          >
            {new Date(priceList.listDate).toLocaleDateString('en-ZA', { timeZone: 'UTC' })}
            {isStale && ' !'}
          </span>
        )}
      </div>

      {!priceList ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            border: '2px dashed #ABABAB',
            borderRadius: 2,
            background: '#FAFAFA',
            minHeight: 140,
          }}
        >
          <ReceiptText style={{ width: 28, height: 28, color: '#9CA3AF' }} />
          <span style={{ fontSize: 11, color: '#6C757D', textAlign: 'center', lineHeight: 1.4, padding: '0 12px' }}>
            No price list selected —<br />set one in Products → Price Lists
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 140, overflowY: 'auto', border: '1px solid #C0C0C0', borderRadius: 2, background: '#FFFFFF' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: '#1B3A6B', color: '#FFFFFF' }}>
                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 700 }}>Material</th>
                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 700 }}>Inc</th>
                {priceList.showExVat && (
                  <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 700 }}>Ex</th>
                )}
              </tr>
            </thead>
            <tbody>
              {priceList.items.map((item, i) => (
                <tr key={item.id} style={{ background: i % 2 === 1 ? '#F4F4F4' : undefined }}>
                  <td style={{ padding: '2px 6px', fontWeight: 600, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                    {item.displayName}
                  </td>
                  <td style={{ padding: '2px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1A1A1A' }}>
                    {new Decimal(item.priceIncVat).toFixed(2)}
                  </td>
                  {priceList.showExVat && (
                    <td style={{ padding: '2px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#6C757D' }}>
                      {new Decimal(item.priceIncVat).div(VAT_DIVISOR).toFixed(2)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
