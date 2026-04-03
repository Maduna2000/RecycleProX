import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTransactionHistory } from '@/lib/services/customerService'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20')

  const result = await getTransactionHistory(params.id, page, limit)
  return NextResponse.json(result)
}
