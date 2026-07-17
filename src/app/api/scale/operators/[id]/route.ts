import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

const PatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('deactivate') }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('reset_password'), newPassword: z.string().min(8) }),
])

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const target = await runWithRequestTenant(req, () => prisma.user.findUnique({ where: { id: params.id } }))
  if (!target || target.role !== 'scale_operator') {
    return NextResponse.json({ error: 'Operator not found' }, { status: 404 })
  }

  const body   = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    let updateData: Record<string, unknown> = {}

    if (parsed.data.action === 'deactivate')  updateData = { isActive: false }
    if (parsed.data.action === 'reactivate')  updateData = { isActive: true, lockedAt: null, failedAttempts: 0 }
    if (parsed.data.action === 'reset_password') {
      updateData = {
        passwordHash:        await bcrypt.hash(parsed.data.newPassword, 12),
        forcePasswordChange: true,
        failedAttempts:      0,
        lockedAt:            null,
      }
    }

    const user = await runWithRequestTenant(req, () => prisma.user.update({
      where:  { id: params.id },
      data:   updateData,
      select: { id: true, fullName: true, username: true, isActive: true, lastLoginAt: true, createdAt: true },
    }))
    logger.info({ targetUserId: params.id, action: parsed.data.action, adminId: session.user.id }, 'scale_operator.patched')
    return NextResponse.json(user)
  } catch (err) {
    logger.error({ err }, 'PATCH /api/scale/operators/[id] failed')
    return NextResponse.json({ error: 'Failed to update operator' }, { status: 500 })
  }
}
