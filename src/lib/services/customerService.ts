import { prisma } from '@/lib/db/prisma'
import { validateSaId } from '@/lib/utils/saId'
import logger from '@/lib/logger'
import type { CreateCustomerInput, QuickCreateInput, UpdateCustomerInput } from '@/lib/schemas/customer'

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class DuplicateCustomerError extends Error {
  existingCustomerId: string
  constructor(id: string) {
    super('A customer with this ID number already exists')
    this.name = 'DuplicateCustomerError'
    this.existingCustomerId = id
  }
}

export class ImmutableFieldError extends Error {
  constructor() { super('ID number cannot be changed'); this.name = 'ImmutableFieldError' }
}

export class ForbiddenError extends Error {
  constructor(msg = 'Forbidden') { super(msg); this.name = 'ForbiddenError' }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createCustomer(data: CreateCustomerInput, userId: string) {
  const idCheck = validateSaId(data.idNumber)
  if (!idCheck.valid) throw new Error(idCheck.error)

  const existing = await prisma.customer.findUnique({ where: { idNumber: data.idNumber } })
  if (existing) throw new DuplicateCustomerError(existing.id)

  const customer = await prisma.customer.create({
    data: { ...data, createdByUserId: userId },
  })
  logger.info({ customerId: customer.id, userId }, 'Customer created')
  return customer
}

export async function quickCreate(data: QuickCreateInput, userId: string) {
  // Return existing customer if duplicate
  const existing = await prisma.customer.findUnique({ where: { idNumber: data.idNumber } })
  if (existing) return existing

  const customer = await prisma.customer.create({
    data: { ...data, customerType: 'casual', createdByUserId: userId },
  })
  logger.info({ customerId: customer.id, userId }, 'Customer quick-created')
  return customer
}

export async function updateCustomer(id: string, data: UpdateCustomerInput, userId: string) {
  const customer = await prisma.customer.update({
    where: { id },
    data,
  })
  logger.info({ customerId: id, userId }, 'Customer updated')
  return customer
}

export async function getCustomer(id: string) {
  return prisma.customer.findUniqueOrThrow({ where: { id } })
}

export async function searchCustomers(
  query: string,
  filters: { type?: string; blacklisted?: boolean; isActive?: boolean },
  page = 1,
  limit = 20,
) {
  const where = {
    ...(filters.type && { customerType: filters.type as 'casual' | 'account' }),
    ...(filters.blacklisted !== undefined && { blacklisted: filters.blacklisted }),
    ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    ...(query && {
      OR: [
        { lastName: { contains: query, mode: 'insensitive' as const } },
        { firstName: { contains: query, mode: 'insensitive' as const } },
        { idNumber: query },
        { phone: { contains: query } },
      ],
    }),
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { lastName: 'asc' },
    }),
    prisma.customer.count({ where }),
  ])

  return { customers, total, page, totalPages: Math.ceil(total / limit) }
}

export async function lookupByIdNumber(idNumber: string) {
  return prisma.customer.findUnique({ where: { idNumber } })
}

export async function blacklistCustomer(id: string, reason: string, userId: string, userRole: string) {
  if (!['manager', 'admin'].includes(userRole)) throw new ForbiddenError('Only managers and admins can blacklist customers')

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      blacklisted: true,
      blacklistReason: reason,
      blacklistedAt: new Date(),
      blacklistedById: userId,
    },
  })
  logger.info({ customerId: id, userId }, 'Customer blacklisted')
  return customer
}

export async function unblacklistCustomer(id: string, userId: string, userRole: string) {
  if (!['manager', 'admin'].includes(userRole)) throw new ForbiddenError('Only managers and admins can unblacklist customers')

  const customer = await prisma.customer.update({
    where: { id },
    data: { blacklisted: false, blacklistReason: null, blacklistedAt: null, blacklistedById: null },
  })
  logger.info({ customerId: id, userId }, 'Customer unblacklisted')
  return customer
}

export async function getTransactionHistory(id: string, page = 1, limit = 20) {
  // Will be populated once M5/M6 Purchase/Sale models exist
  // Returns empty for now — joined in later modules
  return { transactions: [], total: 0, page, totalPages: 0 }
}
