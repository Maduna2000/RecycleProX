import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTransactionHistory } from '@/lib/services/customerService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')

  const result = await runWithRequestTenant(req, () => getTransactionHistory(params.id, page))
  return NextResponse.json(result)
}
