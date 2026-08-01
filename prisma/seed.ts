import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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

// This script uses a bare PrismaClient (not the app's tenant-scoping proxy
// in src/lib/db/prisma.ts — ts-node doesn't resolve the @/ path alias used
// there without extra config), so every write against a tenant-scoped,
// RLS-protected table must open its own transaction and pin
// set_config('app.current_tenant_id', ...) as the first statement itself —
// otherwise FORCE ROW LEVEL SECURITY (prisma/migrations/
// 20260716000003_enable_rls) silently rejects the write (WITH CHECK never
// matches an unpinned NULL session setting).
function asTenant<T>(tenantId: string, fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, tenantId)
    return fn(tx)
  })
}

async function main() {
  // schemaName "public" is the same designation production's Golden Key
  // tenant was registered against, so a fresh local/CI database gets a
  // matching default tenant to log into via the apex-domain path (see
  // resolveDefaultTenant() in src/lib/services/authService.ts) without any
  // per-developer setup step. Tenant itself carries no tenantId/RLS.
  let tenant = await prisma.tenant.findUnique({ where: { schemaName: 'public' } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        companySlug: 'default',
        schemaName: 'public',
        companyName: 'Default Tenant (local/dev)',
        status: 'active',
      },
    })
    console.log(`Seeded default Tenant: ${tenant.id}`)
  } else {
    console.log(`Default tenant already exists: ${tenant.id}`)
  }
  const tenantId = tenant.id

  // Seed default admin if not exists
  const adminExists = await asTenant(tenantId, (tx) => tx.user.findFirst({ where: { role: 'admin' } }))
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin@1234', 12)
    await asTenant(tenantId, (tx) =>
      tx.user.create({
        data: {
          tenantId,
          fullName: 'System Administrator',
          username: 'admin',
          passwordHash,
          role: 'admin',
          forcePasswordChange: true,
        },
      }),
    )
    console.log('Seeded default admin (username: admin, password: Admin@1234)')
  } else {
    console.log('Admin already exists — skipping')
  }

  // Seed default product categories (top-level, parentId = null)
  for (const cat of DEFAULT_CATEGORIES) {
    await asTenant(tenantId, (tx) =>
      tx.productCategory.upsert({
        where:  { tenantId_name: { tenantId, name: cat.name } },
        update: { iconName: cat.iconName },
        create: { ...cat, tenantId },
      }),
    )
  }

  // Seed demo sub-categories (only on first run — skip if already exists)
  const ferrousParent = await asTenant(tenantId, (tx) =>
    tx.productCategory.findUnique({ where: { tenantId_name: { tenantId, name: 'Ferrous' } } }),
  )
  const copperParent = await asTenant(tenantId, (tx) =>
    tx.productCategory.findUnique({ where: { tenantId_name: { tenantId, name: 'Copper' } } }),
  )

  if (ferrousParent) {
    for (const sub of [
      { name: 'HMS (Heavy Melting Scrap)', colorHex: '#455A64', iconName: 'Layers',  sortOrder: 0, parentId: ferrousParent.id },
      { name: 'Light Iron',               colorHex: '#607D8B', iconName: 'Layers',  sortOrder: 1, parentId: ferrousParent.id },
      { name: 'Sheet Iron',               colorHex: '#78909C', iconName: 'Layers',  sortOrder: 2, parentId: ferrousParent.id },
    ]) {
      await asTenant(tenantId, (tx) =>
        tx.productCategory.upsert({
          where:  { tenantId_name: { tenantId, name: sub.name } },
          update: { parentId: ferrousParent.id },
          create: { ...sub, tenantId },
        }),
      )
    }
  }

  if (copperParent) {
    for (const sub of [
      { name: 'Bright Copper',  colorHex: '#FF8C00', iconName: 'Cpu', sortOrder: 0, parentId: copperParent.id },
      { name: 'Burnt Copper',   colorHex: '#CC5500', iconName: 'Cpu', sortOrder: 1, parentId: copperParent.id },
      { name: 'Copper Tanks',   colorHex: '#FF6D00', iconName: 'Box', sortOrder: 2, parentId: copperParent.id },
    ]) {
      await asTenant(tenantId, (tx) =>
        tx.productCategory.upsert({
          where:  { tenantId_name: { tenantId, name: sub.name } },
          update: { parentId: copperParent.id },
          create: { ...sub, tenantId },
        }),
      )
    }
  }

  console.log('Product categories seeded')

  // Seed the legacy-matching receipt declaration text as a default value
  // only — never overwrite an admin's own customization made via
  // Settings -> Tax & Receipts (create-only, not upsert).
  const DEFAULT_DECLARATIONS: Record<string, string> = {
    purchaseNoteDeclaration:
      'I hereby state that I am the lawful owner of the material listed above and have sold them to Golden Key Investments (Pty) Ltd to dispose of as they see fit.',
    saleNoteDeclaration:
      'Goods listed above sold and released to the buyer. Errors and omissions excepted.',
  }
  for (const [key, value] of Object.entries(DEFAULT_DECLARATIONS)) {
    const existing = await asTenant(tenantId, (tx) =>
      tx.systemSettings.findUnique({ where: { tenantId_key: { tenantId, key } } }),
    )
    if (!existing) {
      await asTenant(tenantId, (tx) => tx.systemSettings.create({ data: { tenantId, key, value } }))
      console.log(`Seeded default SystemSettings.${key}`)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
