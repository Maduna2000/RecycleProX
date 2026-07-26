import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { CURRENCIES } from '@/lib/schemas/cashup'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const UpdateCurrencySchema = z.object({
  currency: z.enum(CURRENCIES),
})

class CashUpNotFoundForCurrencyError extends Error {}
class CashUpNotOpenForCurrencyError extends Error {}

// PUT /api/cashup/[id]/currency — update the currency of an open session
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can change the session currency' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await req.json()
    const parsed = UpdateCurrencySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const updated = await runWithRequestTenant(req, async () => {
      // Check if session exists and is open
      const cashUp = await prisma.cashUp.findUnique({ where: { id } })
      if (!cashUp) throw new CashUpNotFoundForCurrencyError()
      if (cashUp.status !== 'open') throw new CashUpNotOpenForCurrencyError()

      // Update the currency
      return prisma.cashUp.update({
        where: { id },
        data: { currency: parsed.data.currency },
      })
    })

    logger.info({ cashUpId: id, currency: parsed.data.currency }, 'Cash-up currency updated')
    return NextResponse.json({ cashUp: updated })
  } catch (err) {
    if (err instanceof CashUpNotFoundForCurrencyError) {
      return NextResponse.json({ error: 'Cash-up session not found' }, { status: 404 })
    }
    if (err instanceof CashUpNotOpenForCurrencyError) {
      return NextResponse.json({ error: 'Cannot change currency on a submitted/approved session' }, { status: 400 })
    }
    logger.error({ err }, 'PUT /api/cashup/[id]/currency failed')
    return NextResponse.json({ error: 'Failed to update currency' }, { status: 500 })
  }
}
