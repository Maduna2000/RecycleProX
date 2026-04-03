import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { lookupByIdNumber } from '@/lib/services/customerService'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const idNumber = req.nextUrl.searchParams.get('idNumber')
  if (!idNumber) return NextResponse.json({ error: 'idNumber is required' }, { status: 400 })

  const customer = await lookupByIdNumber(idNumber)
  return NextResponse.json(customer ?? null)
}
