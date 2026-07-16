import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const APP_ROLE_PASSWORD = process.env.SCRATCH_APP_ROLE_PASSWORD
if (!APP_ROLE_PASSWORD) throw new Error('Set SCRATCH_APP_ROLE_PASSWORD env var before running')

async function main() {
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
         CREATE ROLE app_runtime WITH LOGIN PASSWORD '${APP_ROLE_PASSWORD}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
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
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
