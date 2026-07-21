import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VerifyBusinessLoanPinSchema } from '@/lib/schemas/businessLoan'
import { verifyAdminPinForBusinessLoan, InvalidAdminPinError } from '@/lib/services/businessLoanService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// In-memory per-instance lockout — good enough for this low-traffic, single-
// tenant-per-request reveal path. Keyed by requesting user + target customer
// so one manager's failed guesses on one dealer don't lock out another.
const MAX_ATTEMPTS  = 3
const LOCKOUT_MS    = 60_000
const attempts = new Map<string, { failures: number; lockedUntil: number | null }>()

function attemptKey(userId: string, customerId: string) {
  return `${userId}:${customerId}`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = VerifyBusinessLoanPinSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { customerId, pin } = parsed.data
  const key = attemptKey(session.user.id, customerId)
  const state = attempts.get(key)

  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    const secondsLeft = Math.ceil((state.lockedUntil - Date.now()) / 1000)
    logger.warn({ userId: session.user.id, customerId, secondsLeft }, 'businessLoan.verifyPin.locked_out')
    return NextResponse.json({ error: `Too many attempts — try again in ${secondsLeft}s` }, { status: 429 })
  }

  try {
    const summary = await runWithRequestTenant(req, () => verifyAdminPinForBusinessLoan(customerId, pin))
    attempts.delete(key)
    logger.info({ userId: session.user.id, customerId }, 'businessLoan.verifyPin.success')
    return NextResponse.json(summary)
  } catch (err) {
    if (err instanceof InvalidAdminPinError) {
      const failures = (state?.failures ?? 0) + 1
      const lockedUntil = failures >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null
      attempts.set(key, { failures: lockedUntil ? 0 : failures, lockedUntil })
      logger.warn({ userId: session.user.id, customerId, failures, lockedOut: !!lockedUntil }, 'businessLoan.verifyPin.failed')
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    logger.error({ err }, 'POST /api/business-loans/verify-pin failed')
    return NextResponse.json({ error: 'Failed to verify PIN' }, { status: 500 })
  }
}
