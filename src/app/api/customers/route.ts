import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createCustomer, searchCustomers, DuplicateCustomerError } from '@/lib/services/customerService'
import { CreateCustomerSchema } from '@/lib/schemas/customer'
import logger from '@/lib/logger'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const query = searchParams.get('search') ?? ''
  const type = searchParams.get('type') ?? undefined
  const blacklisted = searchParams.has('blacklisted') ? searchParams.get('blacklisted') === 'true' : undefined
  const isActive = searchParams.has('isActive') ? searchParams.get('isActive') === 'true' : undefined
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')

  const result = await searchCustomers(query, { type, blacklisted, isActive }, page, limit)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateCustomerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const customer = await createCustomer(parsed.data, session.user.id)
    return NextResponse.json(customer, { status: 201 })
  } catch (err) {
    if (err instanceof DuplicateCustomerError) {
      return NextResponse.json({ error: err.message, existingCustomerId: err.existingCustomerId }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/customers failed')
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
