import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { updateUserModuleAccess, getUserModuleAccess } from '@/lib/services/authService'
import logger from '@/lib/logger'
import { z } from 'zod'

const UpdatePermissionsSchema = z.object({
  moduleKeys: z.array(z.string()),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  try {
    const moduleKeys = await getUserModuleAccess(id)
    return NextResponse.json({ moduleKeys })
  } catch (err) {
    logger.error({ err, userId: id }, 'GET /api/users/[id]/permissions failed')
    return NextResponse.json({ error: 'Failed to get permissions' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = UpdatePermissionsSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await updateUserModuleAccess(id, parsed.data.moduleKeys, session.user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err, userId: id }, 'PUT /api/users/[id]/permissions failed')
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 })
  }
}
