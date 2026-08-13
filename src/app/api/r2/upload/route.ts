import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Client, R2_BUCKET } from '@/lib/r2/client'
import {
  mimeToExt, ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES, ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES,
  customerDocumentKey, expenseAttachmentKey,
} from '@/lib/r2'
import { tenantContext } from '@/lib/db/tenantContext'
import { randomUUID } from 'crypto'
import logger from '@/lib/logger'

const CONTEXTS = ['customer_id', 'purchase_photo', 'purchase_signature', 'police_signature', 'stocktake_entry', 'scale_order', 'gate_entry', 'customer_document', 'expense_attachment', 'price_list_logo'] as const
type UploadContext = typeof CONTEXTS[number]

// Contexts that accept PDFs up to 20 MB rather than photo-only up to 10 MB —
// mirrors the isDocumentContext split in src/app/api/r2/upload-url/route.ts.
const DOCUMENT_CONTEXTS = new Set<UploadContext>(['customer_document', 'expense_attachment'])

// The price list logo is embedded into every generated price list PDF, so it
// gets a tighter cap than ordinary photos.
const MAX_LOGO_BYTES = 2 * 1024 * 1024

// Mirrors the tenantKeyPrefix() convention in src/lib/r2/index.ts — no-op
// (empty prefix) today since nothing populates tenantContext yet.
function buildKey(context: UploadContext, referenceId: string, ext: string, photoIndex?: number): string {
  const schemaName = tenantContext.getStore()?.schemaName
  const prefix = schemaName ? `${schemaName}/` : ''
  switch (context) {
    case 'customer_id':        return `${prefix}customers/${referenceId}/id-photo-${randomUUID()}.${ext}`
    case 'purchase_photo':     return `${prefix}purchases/${referenceId}/photo-${randomUUID()}.${ext}`
    case 'purchase_signature': return `${prefix}purchases/${referenceId}/signature-${randomUUID()}.${ext}`
    case 'police_signature':   return `${prefix}police-visits/${referenceId}/signature-${randomUUID()}.${ext}`
    case 'stocktake_entry':    return `${prefix}stocktakes/${referenceId}/photo-${randomUUID()}.${ext}`
    case 'scale_order':        return `${prefix}scale-orders/${referenceId}/photo-${photoIndex ?? 0}-${randomUUID()}.${ext}`
    case 'gate_entry':         return `${prefix}gate-entries/${referenceId}/photo-${photoIndex ?? 0}-${randomUUID()}.${ext}`
    case 'customer_document':  return customerDocumentKey(referenceId, ext)
    case 'expense_attachment': return expenseAttachmentKey(referenceId, ext)
    case 'price_list_logo':    return `${prefix}price-lists/logo-${randomUUID()}.${ext}`
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const context     = formData.get('context') as string | null
  const referenceId = formData.get('referenceId') as string | null
  const file        = formData.get('file') as File | null
  const photoIndex  = formData.get('photoIndex') !== null ? Number(formData.get('photoIndex')) : undefined

  if (!context || !CONTEXTS.includes(context as UploadContext)) {
    return NextResponse.json({ error: `context must be one of: ${CONTEXTS.join(', ')}` }, { status: 422 })
  }
  if (!referenceId || !UUID_RE.test(referenceId)) {
    return NextResponse.json({ error: 'referenceId must be a valid UUID' }, { status: 422 })
  }
  if (!file) {
    return NextResponse.json({ error: 'file field is required' }, { status: 422 })
  }
  const isDocumentContext = DOCUMENT_CONTEXTS.has(context as UploadContext)
  const isLogoContext = context === 'price_list_logo'
  const allowedTypes = isDocumentContext ? ALLOWED_DOCUMENT_TYPES : ALLOWED_PHOTO_TYPES
  const maxBytes = isLogoContext ? MAX_LOGO_BYTES : isDocumentContext ? MAX_DOCUMENT_BYTES : MAX_PHOTO_BYTES
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${allowedTypes.join(', ')}` },
      { status: 422 },
    )
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large — maximum ${isLogoContext ? '2' : isDocumentContext ? '20' : '10'} MB.` }, { status: 422 })
  }

  try {
    const ext  = mimeToExt(file.type)
    const key  = buildKey(context as UploadContext, referenceId, ext, photoIndex)
    const body = Buffer.from(await file.arrayBuffer())

    await getR2Client().send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         key,
      Body:        body,
      ContentType: file.type,
    }))

    logger.info({ context, referenceId, key, bytes: file.size, userId: session.user.id }, 'r2.upload.success')
    return NextResponse.json({ key })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err, message }, 'POST /api/r2/upload failed')
    const isProd = process.env.NODE_ENV === 'production'
    const detail = isProd ? 'Storage upload failed — check R2 credentials' : message
    const debug = isProd ? undefined : {
      bucket: R2_BUCKET,
      accountIdSet: !!process.env.R2_ACCOUNT_ID,
      accessKeySet: !!process.env.R2_ACCESS_KEY_ID,
      secretKeySet: !!process.env.R2_SECRET_ACCESS_KEY,
    }
    return NextResponse.json({ error: detail, debug }, { status: 500 })
  }
}
