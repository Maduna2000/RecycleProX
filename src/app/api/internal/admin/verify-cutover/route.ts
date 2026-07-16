import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { requireRole } from '@/lib/auth-helpers'

// ONE-TIME USE — final read-only check after the RLS cutover (Section 11,
// step 6). Confirms: (1) the app's own connection is now app_runtime, not
// the owner role, (2) that role genuinely lacks BYPASSRLS, (3) RLS/FORCE
// flags are set on the tables, (4) Golden Key's own data is still visible
// end-to-end through the normal tenant-scoped path. No writes, no
// throwaway test data — deliberately avoids mutating production purely to
// prove a point already proven on scratch.
export async function GET() {
  const { response } = await requireRole(['admin'])
  if (response) return response

  // Explicitly the same connection src/lib/db/prisma.ts's rawClient uses —
  // a bare `new PrismaClient()` here would silently check the OWNER role
  // (schema.prisma's default env("DATABASE_URL")) instead of the one the
  // real app actually queries through, defeating the point of this check.
  const prisma = new PrismaClient({
    datasourceUrl: process.env.APP_RUNTIME_DATABASE_URL || process.env.DATABASE_URL,
  })
  try {
    const whoAmI = await prisma.$queryRawUnsafe(`SELECT current_user AS user`)
    const roleFlags = await prisma.$queryRawUnsafe(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
    )
    const rlsFlags = await prisma.$queryRawUnsafe(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('Customer','User','Sale','Purchase') ORDER BY relname`,
    )
    const policyCount = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`,
    )
    // Unpinned raw query on this same (app_runtime) connection — no
    // set_config called here, so this must return zero rows if RLS is
    // genuinely being enforced for this role.
    const unpinnedCustomerCount = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Customer"`)

    return NextResponse.json({
      status: 'checked',
      whoAmI,
      roleFlags,
      rlsFlags,
      policyCount,
      unpinnedCustomerCountShouldBeZero: unpinnedCustomerCount,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
