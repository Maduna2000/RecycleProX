import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import {
  getUploadUrl, customerIdPhotoKey, customerDocumentKey, purchasePhotoKey,
  mimeToExt, ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES,
} from '@/lib/r2'
import { randomUUID } from 'crypto'

const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_PHOTO_TYPES, 'application/pdf']
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024  // 20 MB

const Schema = z.object({
  context: z.enum(['customer_id', 'purchase_photo', 'police_signature', 'stocktake_entry', 'customer_document']),
  referenceId: z.string().uuid(),      // customerId, purchaseId, policeVisitId, or stocktakeId
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

  const isDocumentContext = context === 'customer_document'
  const allowedTypes = isDocumentContext ? ALLOWED_DOCUMENT_TYPES : ALLOWED_PHOTO_TYPES
  const maxBytes = isDocumentContext ? MAX_DOCUMENT_BYTES : MAX_PHOTO_BYTES

  if (!allowedTypes.includes(contentType)) {
    return NextResponse.json({ error: `Unsupported file type. Allowed: ${allowedTypes.join(', ')}` }, { status: 422 })
  }
  if (fileSize > maxBytes) {
    return NextResponse.json({ error: `File too large. Max ${isDocumentContext ? '20' : '10'} MB.` }, { status: 422 })
  }

  try {
    const ext = mimeToExt(contentType)
    const key = context === 'customer_id'
      ? customerIdPhotoKey(referenceId, ext)
      : context === 'customer_document'
        ? customerDocumentKey(referenceId, ext)
        : context === 'police_signature'
          ? `police-visits/${referenceId}/signature-${randomUUID()}.${ext}`
          : context === 'stocktake_entry'
            ? `stocktakes/${referenceId}/photo-${randomUUID()}.${ext}`
            : purchasePhotoKey(referenceId, ext)

    const uploadUrl = await getUploadUrl({ key, contentType, maxBytes: fileSize })

    logger.info({ context, referenceId, key, userId: session.user.id }, 'r2.uploadUrl.generated')
    return NextResponse.json({ uploadUrl, key })
  } catch (err) {
    logger.error({ err }, 'POST /api/r2/upload-url failed')
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }
}
