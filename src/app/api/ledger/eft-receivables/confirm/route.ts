import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { confirmEftReceived, EftAlreadyConfirmedError, NoEftAmountError } from '@/lib/services/ledgerService'

const ConfirmSchema = z.object({ saleId: z.string().uuid() })

/** POST /api/ledger/eft-receivables/confirm — marks a completed EFT sale as bank-confirmed, moving it from Accounts Receivable to Bank. Admin only. */
export async function POST(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const body = await req.json().catch(() => ({}))
  const parsed = ConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await runWithRequestTenant(req, () => confirmEftReceived(parsed.data.saleId, session.user.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof EftAlreadyConfirmedError || err instanceof NoEftAmountError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/ledger/eft-receivables/confirm failed')
    return NextResponse.json({ error: 'Failed to confirm EFT receipt' }, { status: 500 })
  }
}
