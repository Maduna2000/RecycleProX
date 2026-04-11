import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { listCustomerBalances } from '@/lib/services/paymentService'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const balances = await listCustomerBalances()
    return NextResponse.json({ balances })
  } catch (err) {
    logger.error({ err }, 'GET /api/payments/balances failed')
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}
