import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  getCustomer,
  updateCustomer,
  deleteCustomer,
  CustomerHasRecordsError,
  ForbiddenError,
  PhoneNumberConflictError,
} from '@/lib/services/customerService'
import { UpdateCustomerSchema } from '@/lib/schemas/customer'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

// See src/app/api/customers/route.ts — same reasoning, a customer just
// promoted/edited must never be served a cached (pre-update) response.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const customer = await runWithRequestTenant(req, () => getCustomer(params.id))
    return NextResponse.json(customer, { headers: { 'Cache-Control': 'no-store, must-revalidate' } })
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
    const customer = await runWithRequestTenant(req, () =>
      updateCustomer(params.id, parsed.data, session.user.id, session.user.role)
    )
    return NextResponse.json(customer)
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    if (err instanceof PhoneNumberConflictError) {
      return NextResponse.json({ error: err.message, conflicts: err.conflicts }, { status: 409 })
    }
    logger.error({ err }, 'PUT /api/customers/[id] failed')
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can delete customers' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deleteCustomer(params.id, session.user.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CustomerHasRecordsError) {
      return NextResponse.json({
        error: err.message,
        relatedRecords: err.relatedRecords,
      }, { status: 409 })
    }
    logger.error({ err }, 'DELETE /api/customers/[id] failed')
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}
