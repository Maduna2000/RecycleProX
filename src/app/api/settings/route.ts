import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

/**
 * GET /api/settings
 * Returns all system settings as a flat key-value object.
 * Any authenticated user may read settings (needed for VAT rate, yard name, etc.).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await prisma.systemSettings.findMany()
    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key] = row.value
    }
    return NextResponse.json(settings)
  } catch (err) {
    logger.error({ err }, 'GET /api/settings failed')
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/**
 * PUT /api/settings
 * Body: { [key: string]: string }  — upserts each key-value pair.
 * Admin only.
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json() as Record<string, string>
    if (typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a key-value object' }, { status: 400 })
    }

    await prisma.$transaction(
      Object.entries(body).map(([key, value]) =>
        prisma.systemSettings.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        })
      )
    )

    logger.info({ userId: session.user.id, keys: Object.keys(body) }, 'Settings updated')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'PUT /api/settings failed')
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
