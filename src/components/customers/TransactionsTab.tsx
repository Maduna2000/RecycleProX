'use client'

import useSWR from 'swr'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { fetcher } from '@/lib/swrFetcher'


type Transaction = { id: string; type: string; reference: string; date: string; amount: string; status: string }

const columns: Column<Transaction>[] = [
  { key: 'date', header: 'Date', width: '110px', render: (tx) => new Date(tx.date).toLocaleDateString('en-ZA') },
  { key: 'reference', header: 'Reference', render: (tx) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{tx.reference}</span> },
  { key: 'type', header: 'Type', width: '110px', render: (tx) => <span style={{ textTransform: 'capitalize' }}>{tx.type}</span> },
  { key: 'amount', header: 'Amount', width: '110px', render: (tx) => <span style={{ fontFamily: 'monospace' }}>R {tx.amount}</span> },
  { key: 'status', header: 'Status', width: '110px', render: (tx) => <span style={{ textTransform: 'capitalize' }}>{tx.status}</span> },
]

/** Shared between the account and casual customer profile pages — both list the same transaction history. */
export function TransactionsTab({ customerId }: { customerId: string }) {
  const { data, isLoading, error } = useSWR<{ transactions: Transaction[] }>(`/api/customers/${customerId}/transactions`, fetcher)
  const transactions = data?.transactions ?? []

  return (
    <div style={{ padding: 10 }}>
      <DataTable
        columns={columns}
        rows={transactions}
        rowKey={(tx) => tx.id}
        loading={isLoading}
        error={error instanceof Error ? error.message : !!error}
        emptyMessage="No transactions yet"
      />
    </div>
  )
}
