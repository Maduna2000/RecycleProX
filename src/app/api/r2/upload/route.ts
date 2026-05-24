import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Client, R2_BUCKET } from '@/lib/r2/client'
import { mimeToExt, ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from '@/lib/r2'
import { randomUUID } from 'crypto'
import logger from '@/lib/logger'

const CONTEXTS = ['customer_id', 'purchase_photo', 'purchase_signature', 'police_signature', 'stocktake_entry', 'scale_order'] as const
type UploadContext = typeof CONTEXTS[number]

function buildKey(context: UploadContext, referenceId: string, ext: string, photoIndex?: number): string {
  switch (context) {
    case 'customer_id':        return `customers/${referenceId}/id-photo-${randomUUID()}.${ext}`
    case 'purchase_photo':     return `purchases/${referenceId}/photo-${randomUUID()}.${ext}`
    case 'purchase_signature': return `purchases/${referenceId}/signature-${randomUUID()}.${ext}`
    case 'police_signature':   return `police-visits/${referenceId}/signature-${randomUUID()}.${ext}`
    case 'stocktake_entry':    return `stocktakes/${referenceId}/photo-${randomUUID()}.${ext}`
    case 'scale_order':        return `scale-orders/${referenceId}/photo-${photoIndex ?? 0}-${randomUUID()}.${ext}`
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
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_PHOTO_TYPES.join(', ')}` },
      { status: 422 },
    )
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'File too large — maximum 10 MB' }, { status: 422 })
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
