import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireRole } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import { withTenantId } from '@/lib/db/tenantContext'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { resetPassword, unlockAccount } from '@/lib/services/authService'

// ONE-TIME USE, admin-gated — recovery for the live incident where Golden
// Key's own "admin" account locked itself out (5 consecutive wrong-password
// attempts, confirmed via Vercel logs: failedAttempts reached 5, which
// auto-sets lockedAt). The normal "reset a user's password" admin feature
// requires already being logged in as *a* admin — unusable here since the
// only admin account for this tenant is the one that's locked. This route
// uses the caller's still-valid session (requireRole enforces it) to reset
// only Golden Key's own "admin" user — never any other tenant's account,
// never a blanket unlock. Delete this route immediately after use.
export async function POST() {
  const { response } = await requireRole(['admin'])
  if (response) return response

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = await (registryPrisma as any).tenant.findUnique({ where: { schemaName: 'public' } })
    if (!tenant) {
      return NextResponse.json({ error: 'Golden Key tenant (schemaName "public") not found' }, { status: 404 })
    }

    const newPassword = randomBytes(9).toString('base64url')

    const userId = await withTenantId<string>(tenant.id, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await (prisma as any).user.findUnique({
        where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
      })
      if (!user) throw new Error('No "admin" user found under Golden Key')

      await resetPassword(user.id, newPassword, user.id)
      await unlockAccount(user.id, user.id)
      return user.id as string
    })

    return NextResponse.json({
      userId,
      username: 'admin',
      newPassword,
      instructions:
        'Log in at the site\'s normal login page with username "admin" and this password. ' +
        'You will be forced to set your own new password immediately after. Delete this route file afterward.',
    })
  } catch (err) {
    return NextResponse.json({
      error: 'reset-golden-key-admin failed',
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
