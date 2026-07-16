import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { requireRole } from '@/lib/auth-helpers'

// ONE-TIME USE — see i-need-you-to-vectorized-pumpkin.md Section 11, step 4.
// Creates the restricted app_runtime role (NOBYPASSRLS, not the table
// owner) that the app's runtime DATABASE_URL must actually connect as for
// RLS to mean anything — Neon's default owner role has BYPASSRLS, which
// silently defeats FORCE ROW LEVEL SECURITY regardless of policy
// correctness (see the critical finding in
// project_saas_platform_initiative.md, confirmed on the scratch project).
//
// The password is generated here, server-side, at request time — it never
// touches git history or a local shell transcript. Read it once from this
// response and set it directly in Vercel's env var UI, then delete this
// route.
export async function GET() {
  const { response } = await requireRole(['admin'])
  if (response) return response

  const password = randomBytes(24).toString('base64url')
  const prisma = new PrismaClient()
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
           CREATE ROLE app_runtime WITH LOGIN PASSWORD '${password}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
         ELSE
           EXECUTE format('ALTER ROLE app_runtime WITH PASSWORD %L', '${password}');
         END IF;
       END $$;`,
    )
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_runtime`)
    await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime`)
    await prisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime`)
    await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime`)

    const check = await prisma.$queryRawUnsafe(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_runtime'`,
    )

    const currentUrl = new URL(process.env.DATABASE_URL!)
    const appUrl = new URL(currentUrl.toString())
    appUrl.username = 'app_runtime'
    appUrl.password = password

    return NextResponse.json({
      status: 'complete',
      roleCheck: check,
      newDatabaseUrl: appUrl.toString(),
      instructions: 'Copy newDatabaseUrl into Vercel project settings as DATABASE_URL, then redeploy. Delete this route right after.',
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
