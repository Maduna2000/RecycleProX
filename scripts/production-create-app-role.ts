// PRODUCTION counterpart to scripts/scratch-create-app-role.ts. Creates a
// restricted Postgres role for the app's RUNTIME connection — required
// because Neon's default owner role has BYPASSRLS, which silently defeats
// FORCE ROW LEVEL SECURITY entirely (see the critical finding in
// project_saas_platform_initiative.md, confirmed via Section 7's breach
// test on the scratch project). Without this, RLS provides no real
// isolation in production regardless of how correct the policies are.
//
// Run with DATABASE_URL pointed at production's OWNER role (needs
// CREATE ROLE / GRANT privileges). After this runs, production's actual
// runtime DATABASE_URL (the one Vercel's app process uses) must be changed
// to the app_runtime connection string this script prints — NOT the owner
// connection string. Migrations (prisma migrate deploy) keep using the
// owner role, same as today.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const APP_ROLE_PASSWORD = process.env.PRODUCTION_APP_ROLE_PASSWORD
  if (!APP_ROLE_PASSWORD) throw new Error('Set PRODUCTION_APP_ROLE_PASSWORD env var before running')

  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
         CREATE ROLE app_runtime WITH LOGIN PASSWORD '${APP_ROLE_PASSWORD}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
       ELSE
         RAISE NOTICE 'Role app_runtime already exists — not recreating. If you need to rotate its password, do that separately with ALTER ROLE.';
       END IF;
     END $$;`
  )
  console.log('Role app_runtime ensured (NOBYPASSRLS)')

  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_runtime`)
  await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime`)
  await prisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime`)
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime`)
  console.log('Grants applied')

  const check = await prisma.$queryRawUnsafe(`SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_runtime'`)
  console.log(check)

  const dbUrl = new URL(process.env.DATABASE_URL!)
  const appUrl = new URL(dbUrl.toString())
  appUrl.username = 'app_runtime'
  appUrl.password = APP_ROLE_PASSWORD
  console.log('\nSet Vercel\'s DATABASE_URL for the Web project to (host/db unchanged, only user/password differ):')
  console.log(appUrl.toString().replace(APP_ROLE_PASSWORD, '<redacted-see-above>'))
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
