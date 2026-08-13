'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import Decimal from 'decimal.js'
import { colors } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import { SaleForm, type EditingSale } from '../../new/SaleForm'

type FetchedSale = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  amountPaid?: string | null
  paymentMethod: string
  notes?: string | null
  buyerName?: string | null
  buyerIdNumber?: string | null
  buyerPhone?: string | null
  vatAmount?: string | null
  customer?: EditingSale['customer']
  lines: EditingSale['lines']
}

// Re-opens a pending, nothing-paid-yet sale in the same form used to create
// one, pre-filled — see saleService.updateSale for why this is only ever
// offered on that specific state.
export default function EditSalePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: sale, isLoading, error } = useSWR<FetchedSale>(`/api/sales/${id}`, fetcher)

  const canEdit = !!sale && sale.status === 'pending' && new Decimal(sale.amountPaid ?? '0').isZero()

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !sale) return
    if (!isManager) {
      toast.error('Only managers can edit a sale')
      router.replace(`/app/sales/${id}`)
      return
    }
    if (!canEdit) {
      toast.error(
        sale.status !== 'pending'
          ? 'Only a pending sale can be edited'
          : 'This sale already has a payment recorded — void it instead of editing'
      )
      router.replace(`/app/sales/${id}`)
    }
  }, [sessionStatus, isManager, sale, canEdit, id, router])

  if (isLoading || !sale || !canEdit) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary }}>
        {error
          ? <span style={{ fontSize: 13, color: colors.danger }}>{error instanceof Error ? error.message : 'Failed to load sale'}</span>
          : <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />}
      </div>
    )
  }

  const editingSale: EditingSale = {
    id: sale.id,
    refNumber: sale.refNumber,
    paymentMethod: sale.paymentMethod,
    notes: sale.notes,
    applyVat: Number(sale.vatAmount ?? 0) > 0,
    buyerName: sale.buyerName,
    buyerIdNumber: sale.buyerIdNumber,
    buyerPhone: sale.buyerPhone,
    customer: sale.customer,
    lines: sale.lines,
  }

  return <SaleForm editingSale={editingSale} />
}
