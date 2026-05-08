import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getAllSettings, upsertUserSettings, upsertGlobalSettings } from '@/lib/services/settingsService'

/**
 * GET /api/settings
 * Returns all system settings as a flat key-value object.
 * Any authenticated user may read settings (needed for VAT rate, yard name, etc.).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const settings = await getAllSettings()
    return NextResponse.json(settings)
  } catch (err) {
    logger.error({ err }, 'GET /api/settings failed')
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/**
 * PATCH /api/settings
 * Body: { [key: string]: string }  — upserts each key-value pair.
 * Any authenticated user may update keys prefixed with "user:{userId}:".
 */
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as Record<string, string>
    if (typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a key-value object' }, { status: 400 })
    }
    await upsertUserSettings(session.user.id, body)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'No allowed keys provided') {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    logger.error({ err }, 'PATCH /api/settings failed')
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
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
    await upsertGlobalSettings(body, session.user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'PUT /api/settings failed')
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
