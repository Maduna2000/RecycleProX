import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { withTenantId, requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

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

// Seeds default categories and the tenant's first admin user for a brand
// new tenant. Deliberately separate from prisma/seed.ts, which seeds the
// local/dev default tenant and has its own idempotent guard — that script
// is untouched here. Must run inside withTenantId() (see provisionCompany
// below) so every row created here gets the right tenantId stamped and
// passes RLS's WITH CHECK.
export async function seedTenantDefaults(opts: {
  username: string
  password: string
  fullName: string
}): Promise<void> {
  const tenantId = requireTenantId()
  const passwordHash = await bcrypt.hash(opts.password, 12)
  await prisma.user.create({
    data: {
      tenantId,
      fullName: opts.fullName,
      username: opts.username,
      passwordHash,
      role: 'admin',
      forcePasswordChange: true,
    },
  })

  const parentIds: Record<string, string> = {}
  for (const cat of DEFAULT_CATEGORIES) {
    const created = await prisma.productCategory.create({ data: { ...cat, tenantId } })
    parentIds[cat.name] = created.id
  }

  for (const [parentName, subs] of Object.entries(DEFAULT_SUBCATEGORIES)) {
    const parentId = parentIds[parentName]
    if (!parentId) continue
    for (const sub of subs) {
      await prisma.productCategory.create({ data: { ...sub, tenantId, parentId } })
    }
  }
}

function generateTempPassword(): string {
  return `Rp${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 100)}`
}

export interface ProvisionCompanyInput {
  companySlug: string
  companyName: string
  ownerName: string
}

export interface ProvisionCompanyResult {
  tenantId: string
  tempUsername: string
  tempPassword: string
}

// Full provisioning flow called by POST /api/internal/tenants: register the
// tenant, then seed default data + a temp admin login — in that order, so a
// failure partway through never leaves a Tenant row with no data at all
// pointing at a company that thinks it's ready.
//
// Everyone's data lives in the same shared tables now (see
// i-need-you-to-vectorized-pumpkin.md Section 2/5) — there is no schema to
// create or migrate per tenant anymore. This function deletes, not just
// simplifies, the old CREATE SCHEMA/raw-migration-replay/SET search_path
// machinery — three separate bugs were found and fixed in that path over
// its lifetime (see git history on provisionTenantSchema), and none of that
// complexity has a category in this design.
export async function provisionCompany(input: ProvisionCompanyInput): Promise<ProvisionCompanyResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (registryPrisma as any).tenant.findUnique({ where: { companySlug: input.companySlug } })
  if (existing) throw new Error(`Company slug already provisioned: ${input.companySlug}`)

  const tempUsername = 'admin'
  const tempPassword = generateTempPassword()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (registryPrisma as any).tenant.create({
    data: {
      companySlug: input.companySlug,
      // schemaName no longer selects a physical Postgres schema — every
      // tenant shares the same tables (Row-Level Security provides
      // isolation instead, see prisma/migrations/20260716000003_enable_rls).
      // Kept populated only to satisfy this column's pre-existing @unique
      // constraint through the rollback window (Section 9 of the tenancy
      // plan); companySlug is already unique, so it's a safe placeholder.
      schemaName: input.companySlug,
      companyName: input.companyName,
      status: 'active',
    },
  })

  await withTenantId(tenant.id, () =>
    seedTenantDefaults({
      username: tempUsername,
      password: tempPassword,
      fullName: input.ownerName,
    }),
  )

  logger.info({ companySlug: input.companySlug, tenantId: tenant.id }, 'Tenant company provisioned')

  return { tenantId: tenant.id, tempUsername, tempPassword }
}

export interface RegisterExistingTenantInput {
  companySlug: string
  schemaName: string
  companyName: string
}

export interface RegisterExistingTenantResult {
  tenantId: string
  schemaName: string
}

// Registers a pre-existing schema/dataset as a formal Tenant — deliberately
// does NOT call seedTenantDefaults (which would create a duplicate admin
// user and duplicate default categories). This is a one-off path for
// onboarding a pre-existing tenant (Golden Key, living in `public` since
// before multi-tenancy existed), not the normal signup flow — that stays
// provisionCompany() above, completely untouched.
export async function registerExistingTenant(
  input: RegisterExistingTenantInput,
): Promise<RegisterExistingTenantResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingBySlug = await (registryPrisma as any).tenant.findUnique({ where: { companySlug: input.companySlug } })
  if (existingBySlug) throw new Error(`Company slug already registered: ${input.companySlug}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingBySchema = await (registryPrisma as any).tenant.findUnique({ where: { schemaName: input.schemaName } })
  if (existingBySchema) throw new Error(`Schema already registered as a tenant: ${input.schemaName}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (registryPrisma as any).tenant.create({
    data: {
      companySlug: input.companySlug,
      schemaName: input.schemaName,
      companyName: input.companyName,
      status: 'active',
    },
  })

  logger.info({ companySlug: input.companySlug, schemaName: input.schemaName }, 'Existing tenant registered (no provisioning/seeding run)')

  return { tenantId: tenant.id, schemaName: input.schemaName }
}
