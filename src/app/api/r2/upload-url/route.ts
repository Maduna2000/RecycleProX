import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import {
  getUploadUrl, customerIdPhotoKey, purchasePhotoKey,
  mimeToExt, ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES,
} from '@/lib/r2'

const Schema = z.object({
  context: z.enum(['customer_id', 'purchase_photo']),
  referenceId: z.string().uuid(),      // customerId or purchaseId
  contentType: z.string(),
  fileSize: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { context, referenceId, contentType, fileSize } = parsed.data

  if (!ALLOWED_PHOTO_TYPES.includes(contentType)) {
    return NextResponse.json({ error: `Unsupported file type. Allowed: ${ALLOWED_PHOTO_TYPES.join(', ')}` }, { status: 422 })
  }
  if (fileSize > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: `File too large. Max 10 MB.` }, { status: 422 })
  }

  try {
    const ext = mimeToExt(contentType)
    const key = context === 'customer_id'
      ? customerIdPhotoKey(referenceId, ext)
      : purchasePhotoKey(referenceId, ext)

    const uploadUrl = await getUploadUrl({ key, contentType, maxBytes: fileSize })

    logger.info({ context, referenceId, key, userId: session.user.id }, 'r2.uploadUrl.generated')
    return NextResponse.json({ uploadUrl, key })
  } catch (err) {
    logger.error({ err }, 'POST /api/r2/upload-url failed')
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }
}
