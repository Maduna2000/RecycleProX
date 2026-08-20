import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUser, updateUser, deleteUser, ForbiddenError, UserHasActivityError } from '@/lib/services/authService'
import { CreateUserSchema } from '@/lib/schemas/auth'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Only admin/manager can view other users' records — everyone else can
  // only view themselves, matching the list endpoint's ['admin','manager'] gate.
  if (!['admin', 'manager'].includes(session.user.role) && session.user.id !== params.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await runWithRequestTenant(req, () => getUser(params.id))
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = CreateUserSchema.omit({ password: true }).partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  if (session.user.id === params.id && parsed.data.role) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  try {
    const user = await runWithRequestTenant(req, () => updateUser(params.id, parsed.data, session.user.id))
    return NextResponse.json(user)
  } catch (err) {
    logger.error({ err }, 'PUT /api/users/[id] failed')
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deleteUser(params.id, session.user.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof UserHasActivityError) return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'DELETE /api/users/[id] failed')
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
