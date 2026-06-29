'use client'

import useSWR from 'swr'
import { AlertCircle } from 'lucide-react'
import Decimal from 'decimal.js'
import { DataTable, Avatar, type Column } from '@/components/ui/DataTable'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  const { data: balancesData, isLoading: balancesLoading } = useSWR<{ balances: AccountBalance[] }>(
    '/api/payments/balances',
    fetcher,
  )

  const balances = balancesData?.balances ?? []
  const outstandingCount = balances.filter((b) => new Decimal(b.balance).gt(0)).length
  const totalOutstanding = balances.reduce((sum, b) => sum.plus(new Decimal(b.balance).gt(0) ? new Decimal(b.balance) : new Decimal(0)), new Decimal(0))

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
    <PageShell
      title="Account Balances"
      subtitle={outstandingCount > 0 ? `${outstandingCount} with outstanding balance · R ${totalOutstanding.toFixed(2)} total` : 'Customer account balances'}
    >
      <div className="flex-1 min-h-0">
        <DataTable
          columns={balanceColumns}
          rows={balances}
          rowKey={(r) => r.id}
          loading={balancesLoading}
          emptyMessage="No customer balances found"
        />
      </div>
    </PageShell>
  )
}
