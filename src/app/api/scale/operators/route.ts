import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

const CreateOperatorSchema = z.object({
  fullName: z.string().min(2, 'Full name required'),
  username: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const search = searchParams.get('search') ?? undefined
  const page   = parseInt(searchParams.get('page')  ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '50')

  const where = {
    role: 'scale_operator' as const,
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { username: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip:    (page - 1) * limit,
      take:    limit,
      select:  { id: true, fullName: true, username: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ users, total, page, totalPages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = CreateOperatorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  const tenantId = requireTenantId()
  const existing = await prisma.user.findUnique({ where: { tenantId_username: { tenantId, username: parsed.data.username } } })
  if (existing) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    const user = await prisma.user.create({
      data: {
        tenantId,
        fullName:            parsed.data.fullName,
        username:            parsed.data.username,
        passwordHash,
        role:                'scale_operator',
        isActive:            true,
        forcePasswordChange: false,
        createdByUserId:     session.user.id,
      },
      select: { id: true, fullName: true, username: true, isActive: true, lastLoginAt: true, createdAt: true },
    })
    logger.info({ userId: user.id, createdByUserId: session.user.id }, 'scale_operator created')
    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/scale/operators failed')
    return NextResponse.json({ error: 'Failed to create operator' }, { status: 500 })
  }
}
