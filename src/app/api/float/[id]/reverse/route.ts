import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { reverseFloat, FloatReversalError } from '@/lib/services/floatService'
import { ReverseFloatSchema } from '@/lib/schemas/float'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Only managers and admins can reverse float entries' }, { status: 403 })
  }

  const { id: floatId } = await params

  // Parse optional body for reason
  let reason: string | undefined
  try {
    const body = await req.json()
    const parsed = ReverseFloatSchema.safeParse(body)
    if (parsed.success) {
      reason = parsed.data.reason
    }
  } catch {
    // No body provided, that's fine
  }

  try {
    const result = await runWithRequestTenant(req, () => reverseFloat(floatId, session.user.id, reason))
    return NextResponse.json({
      success: true,
      reversedFloatId: result.reversedFloatId,
      reversedDate: result.reversedDate.toISOString().split('T')[0],
    })
  } catch (err) {
    if (err instanceof FloatReversalError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : err.code === 'NOT_LAST_ENTRY' ? 409 : 400
      return NextResponse.json({ error: err.message, code: err.code }, { status: statusCode })
    }
    logger.error({ err, floatId }, 'DELETE /api/float/[id]/reverse failed')
    return NextResponse.json({ error: 'Failed to reverse float' }, { status: 500 })
  }
}
