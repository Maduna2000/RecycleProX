'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertCircle } from 'lucide-react'
import Decimal from 'decimal.js'
import { DataTable, Avatar, type Column } from '@/components/ui/DataTable'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PortalPage } from '@/components/rpx'
import { fetcher } from '@/lib/swrFetcher'


type AccountBalance = {
  id: string
  firstName: string
  lastName: string
  idNumber: string
  phone: string
  totalPurchases: string
  totalPaid: string
  balance: string
}

export default function AccountBalancesPage() {
  const { data: balancesData, isLoading: balancesLoading, error: balancesError } = useSWR<{ balances: AccountBalance[] }>(
    '/api/payments/balances',
    fetcher,
  )

  const [page, setPage] = useState(1)

  const balances = balancesData?.balances ?? []
  const outstandingCount = balances.filter((b) => new Decimal(b.balance).gt(0)).length
  const totalOutstanding = balances.reduce((sum, b) => sum.plus(new Decimal(b.balance).gt(0) ? new Decimal(b.balance) : new Decimal(0)), new Decimal(0))

  const PAGE_SIZE     = 50
  const totalPages    = Math.max(1, Math.ceil(balances.length / PAGE_SIZE))
  const safePage      = Math.min(page, totalPages)
  const pagedBalances = balances.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // ── Account Balances columns ──────────────────────────────────────────────
  const balanceColumns: Column<AccountBalance>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${r.firstName} ${r.lastName}`} size={26} />
          <div>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
              {r.firstName} {r.lastName}
            </p>
            <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.idNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'totalPurchases',
      header: 'Total Purchases',
      width: '140px',
      render: (r) => (
        <span className="font-mono" style={{ color: colors.textSecondary }}>
          R {new Decimal(r.totalPurchases).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'totalPaid',
      header: 'Total Paid',
      width: '120px',
      render: (r) => (
        <span className="font-mono" style={{ color: colors.action }}>
          R {new Decimal(r.totalPaid).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Outstanding',
      width: '140px',
      render: (r) => {
        const outstanding = new Decimal(r.balance)
        const isPos = outstanding.gt(0)
        return (
          <div className="flex items-center gap-1.5">
            {isPos && <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: colors.warning }} />}
            <span className="font-mono font-semibold" style={{ color: isPos ? colors.warning : colors.textSecondary }}>
              R {outstanding.toFixed(2)}
            </span>
          </div>
        )
      },
    },
  ]

  return (
    <PortalPage title="Account Balances">
      {outstandingCount > 0 && (
        <p className="shrink-0" style={{ fontSize: 11, color: '#6C757D', padding: '8px 10px 0' }}>
          {outstandingCount} with outstanding balance · R {totalOutstanding.toFixed(2)} total
        </p>
      )}
      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={balanceColumns}
          rows={pagedBalances}
          rowKey={(r) => r.id}
          loading={balancesLoading}
          error={balancesError instanceof Error ? balancesError.message : !!balancesError}
          total={balances.length}
          page={safePage}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          emptyMessage="No customer balances found"
        />
      </div>
    </PortalPage>
  )
}
