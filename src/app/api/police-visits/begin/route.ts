import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { BeginInspectionSchema } from '@/lib/schemas/police'
import { beginInspection } from '@/lib/services/policeVisitService'

/**
 * POST /api/police-visits/begin
 * Officer registers at the portal — opens an active inspection session.
 * Any staff role except scale_operator (the launching staff member is recorded).
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body   = await req.json().catch(() => null)
  const parsed = BeginInspectionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const visit = await beginInspection(parsed.data, session.user.id)
    return NextResponse.json({ visit }, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/police-visits/begin failed')
    return NextResponse.json({ error: 'Failed to start inspection' }, { status: 500 })
  }
}
