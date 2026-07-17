import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listUsers, createUser } from '@/lib/services/authService'
import { CreateUserSchema } from '@/lib/schemas/auth'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const role     = searchParams.get('role')     ?? undefined
  const isActive = searchParams.get('isActive')
  const search   = searchParams.get('search')   ?? undefined
  const page     = parseInt(searchParams.get('page')  ?? '1')
  const limit    = parseInt(searchParams.get('limit') ?? '20')

  const result = await runWithRequestTenant(req, () => listUsers({
    role,
    isActive: isActive !== null ? isActive === 'true' : undefined,
    search,
    page,
    limit,
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  // Extract allowedModules from body (not validated by CreateUserSchema)
  const allowedModules = Array.isArray(body.allowedModules) ? body.allowedModules : undefined

  try {
    const user = await runWithRequestTenant(req, () => createUser({ ...parsed.data, allowedModules }, session.user.id))
    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/users failed')
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
