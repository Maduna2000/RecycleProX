import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireRole } from '@/lib/auth-helpers'
import { registryPrisma } from '@/lib/db/registryPrisma'

// ONE-TIME USE — CRITICAL INCIDENT REMEDIATION, not a normal diagnostic.
//
// Confirmed via check-db-role: production's runtime connection is
// neondb_owner (bypasses_rls: true), because APP_RUNTIME_DATABASE_URL was
// never actually present in Vercel's env vars (confirmed via `vercel env
// ls` — not listed at all). prisma.ts's `APP_RUNTIME_DATABASE_URL ||
// DATABASE_URL` fallback has therefore been silently using the owner
// connection for every request since the original cutover, which makes
// FORCE ROW LEVEL SECURITY a complete no-op regardless of policy
// correctness — every tenant can currently read/write every other
// tenant's rows.
//
// This route only touches ROLE METADATA (CREATE ROLE / ALTER ROLE /
// GRANT) via registryPrisma, which always connects as the owner role
// (DATABASE_URL) regardless of this fix — never any table DATA. Idempotent:
// safe to call more than once. Uses ALTER ROLE (not DROP+CREATE) if the
// role already exists, so it cannot lose or disrupt anything the role
// already has — only ensures the password is known and the security
// attributes are correct.
//
// The generated password is returned ONLY in this JSON response, to the
// authenticated admin who calls it — never logged, never persisted
// anywhere else. Copy it straight into Vercel's env var UI as
// APP_RUNTIME_DATABASE_URL (Production scope), then redeploy. Delete this
// route immediately after use.
export async function POST() {
  const { response } = await requireRole(['admin'])
  if (response) return response

  try {
    const password = randomBytes(24).toString('base64url')

    await registryPrisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
          CREATE ROLE app_runtime WITH LOGIN PASSWORD '${password}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
        ELSE
          ALTER ROLE app_runtime WITH LOGIN PASSWORD '${password}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END $$;
    `)

    await registryPrisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_runtime`)
    await registryPrisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime`)
    await registryPrisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime`)
    await registryPrisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime`)

    const roleCheck = await registryPrisma.$queryRawUnsafe<
      { rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]
    >(`SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_runtime'`)

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL not set on server — cannot construct connection string' }, { status: 500 })
    }
    const dbUrl = new URL(process.env.DATABASE_URL)
    const appUrl = new URL(dbUrl.toString())
    appUrl.username = 'app_runtime'
    appUrl.password = password

    return NextResponse.json({
      roleVerification: roleCheck[0] ?? null,
      appRuntimeDatabaseUrl: appUrl.toString(),
      instructions: 'Copy appRuntimeDatabaseUrl into Vercel → Project Settings → Environment Variables → add APP_RUNTIME_DATABASE_URL (Production scope) with this exact value, then redeploy. Delete this route file afterward.',
    })
  } catch (err) {
    return NextResponse.json({
      error: 'fix-rls-role failed',
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
