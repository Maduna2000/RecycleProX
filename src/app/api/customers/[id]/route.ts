import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCustomer, updateCustomer } from '@/lib/services/customerService'
import { UpdateCustomerSchema } from '@/lib/schemas/customer'
import logger from '@/lib/logger'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const customer = await getCustomer(params.id)
    return NextResponse.json(customer)
  } catch {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateCustomerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const customer = await updateCustomer(params.id, parsed.data, session.user.id)
    return NextResponse.json(customer)
  } catch (err) {
    logger.error({ err }, 'PUT /api/customers/[id] failed')
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}
