import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { registryPrisma } from '@/lib/db/registryPrisma'
import logger from '@/lib/logger'

export class InvalidSchemaNameError extends Error {
  constructor(schemaName: string) { super(`Invalid tenant schema name: ${schemaName}`); this.name = 'InvalidSchemaNameError' }
}

function isValidSchemaName(name: string): boolean {
  return /^[a-z][a-z0-9_]{2,50}$/.test(name)
}

// Reads every prisma/migrations/*/migration.sql in directory order (the same
// order `prisma migrate deploy` would apply them) and splits each file into
// individual statements. `prisma migrate deploy` isn't safely shellable from
// inside a Vercel serverless function (no guaranteed CLI/filesystem
// semantics at runtime — see plan risk #1), so new tenant schemas are
// migrated by replaying the same DDL through the Prisma Client instead.
// Splitting on `;` followed by a newline is safe for this schema today:
// no current migration embeds a semicolon inside a string/default literal.
function loadMigrationStatements(): string[] {
  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations')
  const dirs = fs
    .readdirSync(migrationsDir)
    .filter((d) => fs.statSync(path.join(migrationsDir, d)).isDirectory())
    .sort()

  const statements: string[] = []
  for (const dir of dirs) {
    const sqlPath = path.join(migrationsDir, dir, 'migration.sql')
    if (!fs.existsSync(sqlPath)) continue
    const sql = fs.readFileSync(sqlPath, 'utf-8')
    // Prisma prefixes every statement with its own `-- CreateTable`-style
    // comment line, so a naive "drop chunks starting with --" filter drops
    // every single statement, not just genuinely comment-only fragments —
    // confirmed by hand: this produced statementCount: 0 against the real
    // migration file, silently creating an empty schema. Strip only the
    // leading comment *lines* within each chunk instead, keeping the SQL.
    const parts = sql
      .split(/;\s*\n/)
      .map((s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim())
      .filter((s) => s.length > 0)
    statements.push(...parts)
  }
  return statements
}

function tenantDatabaseUrl(schemaName: string): string {
  const base = process.env.DATABASE_URL
  if (!base) throw new Error('DATABASE_URL is not set')
  const url = new URL(base)
  url.searchParams.set('schema', schemaName)
  return url.toString()
}

// Creates the Postgres schema and replays every migration against it. The
// caller is responsible for registering the schema in the Tenant table only
// after this — and the seed step below — succeed, so a failed provision
// never leaves a half-registered tenant.
//
// Drops the schema first if it already exists, rather than `CREATE SCHEMA
// IF NOT EXISTS` + hoping the retry picks up where it left off. Confirmed
// by hand: raw-SQL migration replay isn't idempotent (no `IF NOT EXISTS`
// guards in Prisma's generated DDL), so a retry after a partial failure
// (e.g. a dropped connection mid-replay) hit `type "UserRole" already
// exists` on the very type its own earlier attempt had already created.
// Only safe because this function refuses to run at all once a Tenant row
// references this schemaName — i.e. only before a company has ever
// successfully finished provisioning. Enforced here, not just by the
// caller's own pre-check in provisionCompany(), so this function stays safe
// even if some future caller (an admin "re-provision" action, say) forgets
// that precondition.
export async function provisionTenantSchema(schemaName: string): Promise<void> {
  if (!isValidSchemaName(schemaName)) throw new InvalidSchemaNameError(schemaName)

  // registryPrisma is a Web-only, Postgres-only construct — the Tenant model
  // is deliberately excluded from the Desktop SQLite schema (Desktop is
  // single-tenant and never provisions schemas), so this whole module is
  // dead code on Desktop and the cast below is safe because it's
  // unreachable there, not because the type is right.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registered = await (registryPrisma as any).tenant.findUnique({ where: { schemaName } })
  if (registered) {
    throw new Error(`Refusing to drop schema ${schemaName}: already registered as an active tenant`)
  }

  await registryPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
  await registryPrisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`)

  const tenantClient = new PrismaClient({ datasourceUrl: tenantDatabaseUrl(schemaName) })
  try {
    // The connection URL's ?schema= param scopes Prisma's own generated
    // queries (confirmed: prisma.user.findMany() correctly resolves to
    // "tenant_x"."User") but does NOT set the Postgres session's actual
    // search_path — raw SQL via $executeRawUnsafe bypasses Prisma's
    // schema-qualification entirely and runs against whatever search_path
    // the session already has, which defaults to `public`. Confirmed by
    // hand: without this, every unqualified CREATE TABLE/TYPE statement in
    // the migration replay was silently targeting `public` (Golden Key's
    // real production schema) — harmlessly, since it collided with an
    // already-existing object there and errored out immediately on
    // statement #1, but silently is the operative word. This SET is what
    // actually fixes it, verified to persist correctly across the
    // sequential (non-concurrent) loop below.
    await tenantClient.$executeRawUnsafe(`SET search_path TO "${schemaName}"`)

    const statements = loadMigrationStatements()
    for (const statement of statements) {
      await tenantClient.$executeRawUnsafe(statement)
    }
    logger.info({ schemaName, statementCount: statements.length }, 'Tenant schema migrated')
  } finally {
    await tenantClient.$disconnect()
  }
}

const DEFAULT_CATEGORIES = [
  { name: 'Ferrous',     colorHex: '#607D8B', iconName: 'Layers',   sortOrder: 0 },
  { name: 'Non-Ferrous', colorHex: '#5C6BC0', iconName: 'Zap',      sortOrder: 1 },
  { name: 'Copper',      colorHex: '#FF6D00', iconName: 'Cpu',      sortOrder: 2 },
  { name: 'Aluminium',   colorHex: '#7B1FA2', iconName: 'Package',  sortOrder: 3 },
  { name: 'Plastic',     colorHex: '#F9A825', iconName: 'Archive',  sortOrder: 4 },
  { name: 'Paper',       colorHex: '#2E7D32', iconName: 'FileText', sortOrder: 5 },
  { name: 'E-Waste',     colorHex: '#B71C1C', iconName: 'Monitor',  sortOrder: 6 },
  { name: 'Other',       colorHex: '#757575', iconName: 'Box',      sortOrder: 7 },
]

const DEFAULT_SUBCATEGORIES: Record<string, Array<{ name: string; colorHex: string; iconName: string; sortOrder: number }>> = {
  Ferrous: [
    { name: 'HMS (Heavy Melting Scrap)', colorHex: '#455A64', iconName: 'Layers', sortOrder: 0 },
    { name: 'Light Iron',                colorHex: '#607D8B', iconName: 'Layers', sortOrder: 1 },
    { name: 'Sheet Iron',                colorHex: '#78909C', iconName: 'Layers', sortOrder: 2 },
  ],
  Copper: [
    { name: 'Bright Copper', colorHex: '#FF8C00', iconName: 'Cpu', sortOrder: 0 },
    { name: 'Burnt Copper',  colorHex: '#CC5500', iconName: 'Cpu', sortOrder: 1 },
    { name: 'Copper Tanks',  colorHex: '#FF6D00', iconName: 'Box', sortOrder: 2 },
  ],
}

// Seeds default categories and the tenant's first admin user into a brand
// new (guaranteed-empty) tenant schema. Deliberately separate from
// prisma/seed.ts, which seeds the `public` schema (Golden Key's production
// data) and has its own idempotent "skip if admin already exists" guard —
// that script is untouched here to avoid any risk to its existing behavior.
export async function seedTenantSchema(
  client: PrismaClient,
  opts: { username: string; password: string; fullName: string },
): Promise<void> {
  const passwordHash = await bcrypt.hash(opts.password, 12)
  await client.user.create({
    data: {
      fullName: opts.fullName,
      username: opts.username,
      passwordHash,
      role: 'admin',
      forcePasswordChange: true,
    },
  })

  const parentIds: Record<string, string> = {}
  for (const cat of DEFAULT_CATEGORIES) {
    const created = await client.productCategory.upsert({
      where: { name: cat.name },
      update: { iconName: cat.iconName },
      create: cat,
    })
    parentIds[cat.name] = created.id
  }

  for (const [parentName, subs] of Object.entries(DEFAULT_SUBCATEGORIES)) {
    const parentId = parentIds[parentName]
    if (!parentId) continue
    for (const sub of subs) {
      await client.productCategory.upsert({
        where: { name: sub.name },
        update: { parentId },
        create: { ...sub, parentId },
      })
    }
  }
}

function generateTempPassword(): string {
  return `Rp${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 100)}`
}

export interface ProvisionCompanyInput {
  companySlug: string
  schemaName: string
  companyName: string
  ownerName: string
}

export interface ProvisionCompanyResult {
  schemaName: string
  tempUsername: string
  tempPassword: string
}

// Full provisioning flow called by POST /api/internal/tenants: create the
// schema, migrate it, seed default data + a temp admin login, then register
// it in the Tenant registry — in that order, so a failure partway through
// never leaves a Tenant row pointing at a schema that isn't actually ready.
export async function provisionCompany(input: ProvisionCompanyInput): Promise<ProvisionCompanyResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (registryPrisma as any).tenant.findUnique({ where: { schemaName: input.schemaName } })
  if (existing) throw new Error(`Tenant schema already provisioned: ${input.schemaName}`)

  await provisionTenantSchema(input.schemaName)

  const tempUsername = 'admin'
  const tempPassword = generateTempPassword()

  const tenantClient = new PrismaClient({ datasourceUrl: tenantDatabaseUrl(input.schemaName) })
  try {
    await seedTenantSchema(tenantClient, {
      username: tempUsername,
      password: tempPassword,
      fullName: input.ownerName,
    })
  } finally {
    await tenantClient.$disconnect()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (registryPrisma as any).tenant.create({
    data: {
      companySlug: input.companySlug,
      schemaName: input.schemaName,
      companyName: input.companyName,
      status: 'active',
    },
  })

  logger.info({ companySlug: input.companySlug, schemaName: input.schemaName }, 'Tenant company provisioned')

  return { schemaName: input.schemaName, tempUsername, tempPassword }
}
