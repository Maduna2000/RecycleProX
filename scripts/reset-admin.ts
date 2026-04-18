import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, isActive: true, lockedAt: true, failedAttempts: true },
  })

  console.log('\nUsers in database:')
  users.forEach(u => console.log(` - ${u.username} (${u.role}) active=${u.isActive} locked=${!!u.lockedAt} failedAttempts=${u.failedAttempts}`))

  const newPassword = 'Admin@1234'
  const hash = await bcrypt.hash(newPassword, 12)

  // Reset ALL users: clear lock, reset attempts, set known password
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        passwordHash: hash,
        failedAttempts: 0,
        lockedAt: null,
        forcePasswordChange: false,
      },
    })
    console.log(` ✓ ${u.username} password reset to: ${newPassword}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
