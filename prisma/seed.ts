import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
