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
import { PurchaseForm, type EditingPurchase } from '../../new/PurchaseForm'

type FetchedPurchase = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  amountPaid: string
  paymentMethod: string
  notes?: string | null
  loanDeductionAmount?: string | null
  customer: EditingPurchase['customer']
  lines: EditingPurchase['lines']
}

// Re-opens a pending, nothing-paid-yet purchase in the same form used to
// create one, pre-filled — see purchaseService.updatePurchase for why this
// is only ever offered on that specific state.
export default function EditPurchasePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: purchase, isLoading, error } = useSWR<FetchedPurchase>(`/api/purchases/${id}`, fetcher)

  const canEdit = !!purchase && purchase.status === 'pending' && new Decimal(purchase.amountPaid).isZero()

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !purchase) return
    if (!isManager) {
      toast.error('Only managers can edit a purchase')
      router.replace(`/app/purchases/${id}`)
      return
    }
    if (!canEdit) {
      toast.error(
        purchase.status !== 'pending'
          ? 'Only a pending purchase can be edited'
          : 'This purchase already has a payment recorded — void it instead of editing'
      )
      router.replace(`/app/purchases/${id}`)
    }
  }, [sessionStatus, isManager, purchase, canEdit, id, router])

  if (isLoading || !purchase || !canEdit) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary }}>
        {error
          ? <span style={{ fontSize: 13, color: colors.danger }}>{error instanceof Error ? error.message : 'Failed to load purchase'}</span>
          : <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />}
      </div>
    )
  }

  const editingPurchase: EditingPurchase = {
    id: purchase.id,
    refNumber: purchase.refNumber,
    paymentMethod: purchase.paymentMethod,
    notes: purchase.notes,
    loanDeductionAmount: purchase.loanDeductionAmount,
    customer: purchase.customer,
    lines: purchase.lines,
  }

  return <PurchaseForm editingPurchase={editingPurchase} />
}
