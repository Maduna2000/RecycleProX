import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { createUser } from '@/lib/services/authService'
import { CreateUserSchema } from '@/lib/schemas/auth'
import logger from '@/lib/logger'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const role = searchParams.get('role') ?? undefined
  const isActive = searchParams.get('isActive')
  const search = searchParams.get('search') ?? undefined
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')

  const where = {
    ...(role && { role: role as import('@prisma/client').UserRole }),
    ...(isActive !== null && { isActive: isActive === 'true' }),
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
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, fullName: true, username: true, role: true,
        isActive: true, forcePasswordChange: true, failedAttempts: true,
        lockedAt: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ users, total, page, totalPages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const user = await createUser(parsed.data, session.user.id)
    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/users failed')
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
