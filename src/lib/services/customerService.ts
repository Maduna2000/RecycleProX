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

async function generateAccountCode(lastName: string): Promise<string> {
  const prefix = lastName.replace(/[^a-zA-Z]/g, '').toUpperCase().substring(0, 3).padEnd(3, 'X')
  const existing = await prisma.customer.findMany({
    where: { accountCode: { startsWith: prefix } },
    select: { accountCode: true },
  })
  const nums = existing
    .map((c) => parseInt((c.accountCode ?? '').slice(3)))
    .filter((n) => !isNaN(n))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

const DEALER_PRICE_GROUP_NAMES: Record<string, string> = {
  dealer_1: 'Dealer 1',
  dealer_2: 'Dealer 2',
  dealer_3: 'Dealer 3',
}

async function resolvePriceGroupId(
  dealerCategory: string | undefined,
  explicitPriceGroupId: string | undefined,
): Promise<string | undefined> {
  if (dealerCategory === 'casual') return undefined
  if (dealerCategory && DEALER_PRICE_GROUP_NAMES[dealerCategory]) {
    const group = await prisma.priceGroup.findFirst({
      where: { name: DEALER_PRICE_GROUP_NAMES[dealerCategory] },
    })
    if (group) return group.id
  }
  return explicitPriceGroupId
}

export async function createCustomer(data: CreateCustomerInput, userId: string) {
  const idCheck = validateSaId(data.idNumber)
  if (!idCheck.valid) throw new Error(idCheck.error)

  const existing = await prisma.customer.findUnique({ where: { idNumber: data.idNumber } })
  if (existing) throw new DuplicateCustomerError(existing.id)

  const resolvedPriceGroupId = await resolvePriceGroupId(data.dealerCategory, data.priceGroupId)

  const accountCode = data.customerType === 'account'
    ? await generateAccountCode(data.lastName)
    : undefined

  const customer = await prisma.customer.create({
    data: { ...data, priceGroupId: resolvedPriceGroupId, createdByUserId: userId, accountCode },
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
  let updateData: typeof data = data

  if (data.dealerCategory !== undefined) {
    const resolvedPriceGroupId = await resolvePriceGroupId(
      data.dealerCategory ?? undefined,
      data.priceGroupId ?? undefined,
    )
    updateData = { ...data, priceGroupId: resolvedPriceGroupId }
  }

  // Auto-assign account code when converting casual → account
  let newAccountCode: string | undefined
  if (data.customerType === 'account') {
    const current = await prisma.customer.findUnique({ where: { id }, select: { accountCode: true, lastName: true } })
    if (current && !current.accountCode) {
      const lastName = data.lastName ?? current.lastName
      newAccountCode = await generateAccountCode(lastName)
    }
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: { ...updateData, ...(newAccountCode && { accountCode: newAccountCode }) },
  })
  logger.info({ customerId: id, userId }, 'Customer updated')
  return customer
}

export async function getCustomer(id: string) {
  return prisma.customer.findUniqueOrThrow({
    where: { id },
    include: { priceGroup: { select: { id: true, name: true } } },
  })
}

export async function searchCustomers(
  query: string,
  filters: {
    type?: string
    blacklisted?: boolean
    isActive?: boolean
    dealerCategory?: string
    primaryFunction?: string
    priceGroupId?: string
  },
  page = 1,
  limit = 20,
) {
  const where = {
    ...(filters.type            && { customerType:    filters.type            as 'casual' | 'account' }),
    ...(filters.blacklisted !== undefined && { blacklisted: filters.blacklisted }),
    ...(filters.isActive    !== undefined && { isActive:    filters.isActive }),
    ...(filters.dealerCategory  && { dealerCategory:  filters.dealerCategory  as 'casual' | 'dealer_1' | 'dealer_2' | 'dealer_3' }),
    ...(filters.primaryFunction && { primaryFunction: filters.primaryFunction as 'supplier' | 'customer' | 'both' }),
    ...(filters.priceGroupId    && { priceGroupId:    filters.priceGroupId }),
    ...(query && {
      OR: [
        { lastName:    { contains: query, mode: 'insensitive' as const } },
        { firstName:   { contains: query, mode: 'insensitive' as const } },
        { idNumber:    query },
        { phone:       { contains: query } },
        { accountCode: { contains: query, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { lastName: 'asc' },
      include: { priceGroup: { select: { id: true, name: true } } },
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

export async function deleteCustomer(id: string, userId: string) {
  await prisma.customer.delete({ where: { id } })
  logger.info({ customerId: id, userId }, 'Customer deleted')
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

export async function getTransactionHistory(id: string, page = 1) {
  const limit = 20
  const skip  = (page - 1) * limit

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where:   { customerId: id },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
      select:  { id: true, refNumber: true, totalAmount: true, status: true, createdAt: true, paymentMethod: true },
    }),
    prisma.purchase.count({ where: { customerId: id } }),
  ])

  const transactions = purchases.map((p) => ({
    id:            p.id,
    type:          'purchase',
    reference:     p.refNumber,
    date:          p.createdAt.toISOString(),
    amount:        p.totalAmount.toString(),
    status:        p.status,
    paymentMethod: p.paymentMethod,
  }))

  return { transactions, total, page, totalPages: Math.ceil(total / limit) }
}

// ─── Customer Documents ───────────────────────────────────────────────────────

export async function listCustomerDocuments(customerId: string) {
  return prisma.customerDocument.findMany({
    where:   { customerId },
    orderBy: { uploadedAt: 'desc' },
  })
}

export async function addCustomerDocument(
  customerId: string,
  data: {
    documentType: import('@prisma/client').CustomerDocumentType
    r2Key:        string
    fileName:     string
    notes?:       string
  },
  uploadedByUserId: string
) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } })
  if (!customer) throw new Error(`Customer "${customerId}" not found`)

  const doc = await prisma.customerDocument.create({
    data: { customerId, documentType: data.documentType, r2Key: data.r2Key, fileName: data.fileName, notes: data.notes, uploadedByUserId },
  })
  logger.info({ docId: doc.id, customerId, uploadedByUserId }, 'customer.document.added')
  return doc
}

export async function deleteCustomerDocument(
  customerId: string,
  docId: string,
  deletedByUserId: string
) {
  const doc = await prisma.customerDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.customerId !== customerId) throw new Error('Document not found')

  const { deleteR2Object } = await import('@/lib/r2')
  await deleteR2Object(doc.r2Key)
  await prisma.customerDocument.delete({ where: { id: docId } })
  logger.info({ docId, customerId, deletedByUserId }, 'customer.document.deleted')
}
