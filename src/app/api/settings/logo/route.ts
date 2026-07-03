import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { uploadBytes, deleteR2Object } from '@/lib/r2'
import { readPngMeta } from '@/lib/utils/pngMeta'
import { getAllSettings, upsertGlobalSettings, LOGO_SETTING_KEY } from '@/lib/services/settingsService'

/**
 * Company logo used on generated documents (purchase/sale notes).
 *
 * Requirements enforced here so the logo renders properly wherever it's used:
 *  - PNG only, with a transparent background (alpha channel required)
 *  - Max 1 MB
 *  - 100–2000 px wide
 *  - Aspect ratio between 1:1 (square) and 5:1 (wide banner) — no tall logos
 */
const MAX_LOGO_BYTES = 1 * 1024 * 1024
const MIN_WIDTH = 100
const MAX_WIDTH = 2000
const MAX_RATIO = 5 // width ÷ height

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file field is required' }, { status: 422 })
  if (file.type !== 'image/png') {
    return NextResponse.json({ error: 'Logo must be a PNG (PNG supports the required transparent background)' }, { status: 422 })
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'Logo too large — maximum 1 MB' }, { status: 422 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const meta = readPngMeta(bytes)
  if (!meta) return NextResponse.json({ error: 'File is not a valid PNG' }, { status: 422 })

  if (!meta.hasAlpha) {
    return NextResponse.json(
      { error: 'Logo must have a transparent background — export the PNG with transparency (alpha channel)' },
      { status: 422 }
    )
  }
  if (meta.width < MIN_WIDTH || meta.width > MAX_WIDTH) {
    return NextResponse.json(
      { error: `Logo width must be between ${MIN_WIDTH} and ${MAX_WIDTH} pixels (got ${meta.width}px)` },
      { status: 422 }
    )
  }
  const ratio = meta.width / meta.height
  if (ratio < 1 || ratio > MAX_RATIO) {
    return NextResponse.json(
      { error: `Logo must be square to wide — width:height between 1:1 and ${MAX_RATIO}:1 (got ${meta.width}×${meta.height})` },
      { status: 422 }
    )
  }

  try {
    const key = `settings/company-logo-${Date.now()}.png`
    await uploadBytes(key, bytes, 'image/png')

    // Point the setting at the new object, then clean up the old one
    const settings = await getAllSettings()
    const oldKey = settings[LOGO_SETTING_KEY]
    await upsertGlobalSettings({ [LOGO_SETTING_KEY]: key }, session.user.id)
    if (oldKey && oldKey !== key) {
      await deleteR2Object(oldKey).catch((err) => logger.warn({ err, oldKey }, 'settings.logo.cleanup.failed'))
    }

    logger.info({ key, width: meta.width, height: meta.height, userId: session.user.id }, 'settings.logo.uploaded')
    return NextResponse.json({ key, width: meta.width, height: meta.height })
  } catch (err) {
    logger.error({ err }, 'POST /api/settings/logo failed')
    return NextResponse.json({ error: 'Failed to store logo' }, { status: 500 })
  }
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const settings = await getAllSettings()
    const oldKey = settings[LOGO_SETTING_KEY]
    await upsertGlobalSettings({ [LOGO_SETTING_KEY]: '' }, session.user.id)
    if (oldKey) {
      await deleteR2Object(oldKey).catch((err) => logger.warn({ err, oldKey }, 'settings.logo.cleanup.failed'))
    }
    logger.info({ userId: session.user.id }, 'settings.logo.removed')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'DELETE /api/settings/logo failed')
    return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 })
  }
}
