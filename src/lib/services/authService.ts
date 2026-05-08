import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import type { CreateUserInput } from '@/lib/schemas/auth'

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class AccountLockedError extends Error {
  constructor() { super('Account is locked — contact an administrator'); this.name = 'AccountLockedError' }
}

export class AccountInactiveError extends Error {
  constructor() { super('Account is inactive — contact an administrator'); this.name = 'AccountInactiveError' }
}

export class InvalidCredentialsError extends Error {
  constructor() { super('Invalid username or password'); this.name = 'InvalidCredentialsError' }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() { super('Current password is incorrect'); this.name = 'InvalidCurrentPasswordError' }
}

export class InvalidPinError extends Error {
  constructor() { super('Incorrect PIN'); this.name = 'InvalidPinError' }
}

export class ForbiddenError extends Error {
  constructor(msg = 'Forbidden') { super(msg); this.name = 'ForbiddenError' }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } })

  if (!user) {
    logger.warn({ username }, 'Login failed: user not found')
    throw new InvalidCredentialsError()
  }

  if (!user.isActive) {
    logger.warn({ username }, 'Login failed: account inactive')
    throw new AccountInactiveError()
  }

  if (user.lockedAt) {
    logger.warn({ username }, 'Login failed: account locked')
    throw new AccountLockedError()
  }

  const valid = await bcrypt.compare(password, user.passwordHash)

  if (!valid) {
    const failedAttempts = user.failedAttempts + 1
    const lockUpdate = failedAttempts >= 5 ? { lockedAt: new Date() } : {}
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts, ...lockUpdate },
    })
    logger.warn({ username, failedAttempts }, 'Login failed: wrong password')
    throw new InvalidCredentialsError()
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lastLoginAt: new Date() },
  })

  logger.info({ userId: user.id, username }, 'Login successful')
  return {
    user: sanitize(user),
    forcePasswordChange: user.forcePasswordChange,
  }
}

export async function createUser(data: CreateUserInput, createdByUserId: string) {
  const passwordHash = await bcrypt.hash(data.password, 12)
  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      username: data.username,
      passwordHash,
      role: data.role,
      isActive: data.isActive ?? true,
      forcePasswordChange: true,
      createdByUserId,
    },
  })
  logger.info({ userId: user.id, createdByUserId }, 'User created')
  return sanitize(user)
}

export async function updateUser(
  id: string,
  data: Partial<Omit<CreateUserInput, 'password'>>,
  updatedByUserId: string,
) {
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(data.fullName && { fullName: data.fullName }),
      ...(data.role && { role: data.role }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })
  logger.info({ userId: id, updatedByUserId }, 'User updated')
  return sanitize(user)
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw new InvalidCurrentPasswordError()

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, forcePasswordChange: false },
  })
  logger.info({ userId }, 'Password changed')
}

export async function resetPassword(userId: string, newPassword: string, adminId: string) {
  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, forcePasswordChange: true },
  })
  logger.info({ userId, adminId }, 'Password reset by admin')
}

export async function toggleActive(userId: string, adminId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  })
  logger.info({ userId, adminId, isActive: updated.isActive }, 'User active status toggled')
  return sanitize(updated)
}

export async function unlockAccount(userId: string, adminId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedAttempts: 0, lockedAt: null },
  })
  logger.info({ userId, adminId }, 'Account unlocked')
}

export async function setPin(userId: string, pin: string) {
  const pinHash = await bcrypt.hash(pin, 10)
  await prisma.user.update({ where: { id: userId }, data: { pinHash } })
  logger.info({ userId }, 'PIN set')
}

// Fallback PIN used when a user has not yet set their own PIN.
// Admin can override this in SystemSettings key `defaultPin`.
const SYSTEM_DEFAULT_PIN = '1234'

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const [user, defaultPinRow] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.systemSettings.findUnique({ where: { key: 'defaultPin' } }),
  ])

  if (user.pinHash) {
    // User has set their own PIN — verify against it
    return bcrypt.compare(pin, user.pinHash)
  }

  // No user PIN yet — compare against the system default (plaintext, 4-digit)
  const defaultPin = defaultPinRow?.value ?? SYSTEM_DEFAULT_PIN
  return pin === defaultPin
}

export async function resetPinToDefault(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { pinHash: null } })
  logger.info({ userId }, 'PIN reset to default')
}

// ─── User queries ─────────────────────────────────────────────────────────────

const USER_SELECT = {
  id: true, fullName: true, username: true, role: true,
  isActive: true, forcePasswordChange: true, failedAttempts: true,
  lockedAt: true, lastLoginAt: true, createdAt: true,
} as const

export async function listUsers(opts: {
  role?:     string
  isActive?: boolean
  search?:   string
  page?:     number
  limit?:    number
}) {
  const { page = 1, limit = 20 } = opts
  const where = {
    ...(opts.role     && { role:     opts.role as import('@prisma/client').UserRole }),
    ...(opts.isActive !== undefined && { isActive: opts.isActive }),
    ...(opts.search   && {
      OR: [
        { fullName: { contains: opts.search, mode: 'insensitive' as const } },
        { username: { contains: opts.search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip:    (page - 1) * limit,
      take:    limit,
      select:  USER_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ])

  return { users, total, page, totalPages: Math.ceil(total / limit) }
}

export async function getUser(id: string) {
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(user: {
  id: string
  fullName: string
  username: string
  role: string
  isActive: boolean
  forcePasswordChange: boolean
  failedAttempts: number
  lockedAt: Date | null
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
  createdByUserId: string | null
}) {
  const { ...safe } = user
  return safe
}
