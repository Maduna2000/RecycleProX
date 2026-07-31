import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { reverseFloatMovement, FloatMovementReversalError, FloatMovementLockedError } from '@/lib/services/floatService'
import { ReverseFloatMovementSchema } from '@/lib/schemas/float'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Only managers and admins can reverse float movements' }, { status: 403 })
  }

  const { id: movementId } = await params

  const body = await req.json().catch(() => ({}))
  const parsed = ReverseFloatMovementSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await runWithRequestTenant(req, () => reverseFloatMovement(movementId, session.user.id, parsed.data.reason))
    return NextResponse.json({
      success: true,
      reversedMovementId: result.reversedMovementId,
    })
  } catch (err) {
    if (err instanceof FloatMovementReversalError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 409
      return NextResponse.json({ error: err.message, code: err.code }, { status: statusCode })
    }
    if (err instanceof FloatMovementLockedError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
    }
    logger.error({ err, movementId }, 'DELETE /api/float/movement/[id]/reverse failed')
    return NextResponse.json({ error: 'Failed to reverse movement' }, { status: 500 })
  }
}
