import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireRole } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import { withTenantId } from '@/lib/db/tenantContext'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { resetPassword, unlockAccount } from '@/lib/services/authService'

// ONE-TIME USE, admin-gated — recovery for a locked-out admin account.
// Both Golden Key and any newly-provisioned company get an "admin" user,
// so the failed-login log line alone (which only records username, not
// tenantId) can't tell them apart — this route takes companySlug
// explicitly rather than assuming which tenant is affected. The normal
// "reset a user's password" admin feature requires already being logged in
// as *a* admin, which is unusable when the only admin account for that
// specific tenant is the one that's locked. Uses the caller's own
// still-valid session (requireRole enforces it) to reset exactly the one
// named tenant's "admin" user — never a blanket unlock across tenants.
// Delete this route immediately after use.
export async function POST(req: Request) {
  const { response } = await requireRole(['admin'])
  if (response) return response

  try {
    const body = await req.json().catch(() => ({}))
    const companySlug = typeof body.companySlug === 'string' ? body.companySlug : null
    // 'unlock' clears the lockout without touching the existing password —
    // use for accounts whose password is known-good and just got rate-
    // limited (e.g. Golden Key, hit by repeated attempts that were actually
    // intended for a different tenant). 'reset' additionally issues a new
    // random password — use when the password itself may be lost (e.g. a
    // freshly-provisioned company's one-time temp password).
    const action = body.action === 'reset' ? 'reset' : 'unlock'
    if (!companySlug) {
      return NextResponse.json({ error: 'Body must include { "companySlug": "...", "action": "unlock" | "reset" }' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = await (registryPrisma as any).tenant.findUnique({ where: { companySlug } })
    if (!tenant) {
      return NextResponse.json({ error: `No tenant found for companySlug "${companySlug}"` }, { status: 404 })
    }

    const newPassword = action === 'reset' ? randomBytes(9).toString('base64url') : null

    const userId = await withTenantId<string>(tenant.id, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await (prisma as any).user.findUnique({
        where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
      })
      if (!user) throw new Error(`No "admin" user found under tenant "${companySlug}"`)

      if (newPassword) await resetPassword(user.id, newPassword, user.id)
      await unlockAccount(user.id, user.id)
      return user.id as string
    })

    return NextResponse.json({
      companySlug,
      userId,
      username: 'admin',
      action,
      newPassword,
      instructions: newPassword
        ? 'Log in with username "admin" and this new password (use the Company field on /login for this tenant\'s slug). You will be forced to set your own new password immediately after. Delete this route file afterward.'
        : 'Account unlocked, existing password unchanged. Log in with username "admin" and the known password (use the Company field on /login for this tenant\'s slug). Delete this route file afterward.',
    })
  } catch (err) {
    return NextResponse.json({
      error: 'reset-golden-key-admin failed',
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
