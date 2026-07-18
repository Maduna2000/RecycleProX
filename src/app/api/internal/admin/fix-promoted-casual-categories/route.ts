import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

// ONE-TIME USE, admin-gated — data repair for the promotion-flow flaw where
// casuals promoted to accounts were dropped into the Dealer 1 category (the
// old Promote modal's default). The promotion flow now keeps promoted
// casuals in the Casual category; this route retro-fixes the ones already
// promoted: every customer with an audit-trail casual→account transition
// that is still sitting on dealer_1 gets dealerCategory='casual' and its
// dealer price group cleared. Runs against the calling admin's own tenant
// (run it logged into Golden Key). POST {} = dry run (report only);
// POST { "apply": true } = write the fix. Delete this route after use.
// Visiting the URL in a logged-in browser tab = safe dry-run report.
export async function GET(req: Request) {
  return handle(req, false)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return handle(req, body?.apply === true)
}

async function handle(req: Request, apply: boolean) {
  const { session, response } = await requireRole(['admin'])
  if (response) return response

  const result = await runWithRequestTenant(req, async () => {
    // Every audited casual→account transition, whoever performed it.
    const updateLogs = await prisma.auditLog.findMany({
      where: { tableName: 'Customer', action: 'UPDATE' },
      orderBy: { createdAt: 'asc' },
      select: { recordId: true, oldValues: true, newValues: true },
    })

    type OldNew = { customerType?: string }
    const promotedIds = Array.from(new Set(
      updateLogs
        .filter((log) =>
          (log.oldValues as OldNew | null)?.customerType === 'casual' &&
          (log.newValues as OldNew | null)?.customerType === 'account'
        )
        .map((log) => log.recordId)
    ))

    // Only fix the ones still parked on dealer_1 — a deliberate later
    // admin assignment to dealer_2/3 (or back to casual) is left alone.
    const targets = await prisma.customer.findMany({
      where: {
        id: { in: promotedIds },
        customerType: 'account',
        dealerCategory: 'dealer_1',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        accountCode: true,
        dealerCategory: true,
        priceGroupId: true,
      },
      orderBy: { lastName: 'asc' },
    })

    let updated = 0
    if (apply && targets.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const t of targets) {
          await tx.customer.update({
            where: { id: t.id },
            data: { dealerCategory: 'casual', priceGroupId: null },
          })
          updated++
        }
      })
      logger.info(
        { updated, byUserId: session.user.id },
        'fix-promoted-casual-categories: reset promoted casuals to Casual category'
      )
    }

    return {
      mode: apply ? 'applied' : 'dry-run (POST {"apply": true} to write)',
      casualToAccountTransitionsFound: promotedIds.length,
      customersStillOnDealer1: targets.length,
      updated,
      customers: targets.map((t) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        accountCode: t.accountCode,
      })),
    }
  })

  return NextResponse.json(result)
}
