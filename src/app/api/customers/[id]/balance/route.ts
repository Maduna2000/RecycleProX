import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getCustomerBalance, CustomerNotFoundError } from '@/lib/services/paymentService'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const balance = await getCustomerBalance(params.id)
    return NextResponse.json({
      ...balance,
      totalPurchases: balance.totalPurchases.toFixed(2),
      totalPaid: balance.totalPaid.toFixed(2),
      balance: balance.balance.toFixed(2),
    })
  } catch (err) {
    if (err instanceof CustomerNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/customers/[id]/balance failed')
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}
