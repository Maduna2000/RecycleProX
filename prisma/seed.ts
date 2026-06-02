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

async function main() {
  // Seed default admin if not exists
  const adminExists = await prisma.user.findFirst({ where: { role: 'admin' } })
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin@1234', 12)
    await prisma.user.create({
      data: {
        fullName: 'System Administrator',
        username: 'admin',
        passwordHash,
        role: 'admin',
        forcePasswordChange: true,
      },
    })
    console.log('Seeded default admin (username: admin, password: Admin@1234)')
  } else {
    console.log('Admin already exists — skipping')
  }

  // Seed default product categories (top-level, parentId = null)
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.productCategory.upsert({
      where:  { name: cat.name },
      update: { iconName: cat.iconName },
      create: cat,
    })
  }

  // Seed demo sub-categories (only on first run — skip if already exists)
  const ferrousParent  = await prisma.productCategory.findUnique({ where: { name: 'Ferrous' } })
  const copperParent   = await prisma.productCategory.findUnique({ where: { name: 'Copper' } })

  if (ferrousParent) {
    for (const sub of [
      { name: 'HMS (Heavy Melting Scrap)', colorHex: '#455A64', iconName: 'Layers',  sortOrder: 0, parentId: ferrousParent.id },
      { name: 'Light Iron',               colorHex: '#607D8B', iconName: 'Layers',  sortOrder: 1, parentId: ferrousParent.id },
      { name: 'Sheet Iron',               colorHex: '#78909C', iconName: 'Layers',  sortOrder: 2, parentId: ferrousParent.id },
    ]) {
      await prisma.productCategory.upsert({
        where:  { name: sub.name },
        update: { parentId: ferrousParent.id },
        create: sub,
      })
    }
  }

  if (copperParent) {
    for (const sub of [
      { name: 'Bright Copper',  colorHex: '#FF8C00', iconName: 'Cpu', sortOrder: 0, parentId: copperParent.id },
      { name: 'Burnt Copper',   colorHex: '#CC5500', iconName: 'Cpu', sortOrder: 1, parentId: copperParent.id },
      { name: 'Copper Tanks',   colorHex: '#FF6D00', iconName: 'Box', sortOrder: 2, parentId: copperParent.id },
    ]) {
      await prisma.productCategory.upsert({
        where:  { name: sub.name },
        update: { parentId: copperParent.id },
        create: sub,
      })
    }
  }

  console.log('Product categories seeded')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
