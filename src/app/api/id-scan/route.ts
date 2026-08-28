import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { randomUUID } from 'crypto'
import { uploadBytes, mimeToExt, ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from '@/lib/r2'
import logger from '@/lib/logger'

// POST /api/id-scan
// Uploads the compressed ID photo to R2 and returns a staging key.
// OCR runs client-side (Tesseract.js in the browser) to avoid Vercel's 10-second
// serverless timeout — Tesseract needs 20–60 s which exceeds the free-tier limit.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file field is required' }, { status: 422 })
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_PHOTO_TYPES.join(', ')}` },
      { status: 422 },
    )
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'File too large — maximum 10 MB' }, { status: 422 })
  }

  // Fail fast with a clear message if R2 is not configured in this environment
  const r2AccountId = process.env.R2_ACCOUNT_ID
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY
  const r2Bucket    = process.env.R2_BUCKET ?? process.env.R2_BUCKET_NAME
  if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
    const missing = [
      !r2AccountId && 'R2_ACCOUNT_ID',
      !r2AccessKey && 'R2_ACCESS_KEY_ID',
      !r2SecretKey && 'R2_SECRET_ACCESS_KEY',
      !r2Bucket    && 'R2_BUCKET',
    ].filter(Boolean).join(', ')
    logger.error({ missing }, 'id-scan: R2 env vars not set')
    return NextResponse.json({ error: `R2 not configured — set ${missing} in Vercel environment variables` }, { status: 500 })
  }

  const bytes      = new Uint8Array(await file.arrayBuffer())
  const ext        = mimeToExt(file.type)
  const scanR2Key  = `customers/scan-staging/${randomUUID()}.${ext}`

  try {
    await uploadBytes(scanR2Key, bytes, file.type)
    logger.info({ userId: session.user.id, scanR2Key, bytes: file.size }, 'id-scan upload ok')
    return NextResponse.json({ scanR2Key })
  } catch (err) {
    const errMsg = 'Failed to scan ID document'
    logger.error({ err, scanR2Key }, 'POST /api/id-scan — R2 upload failed')
    return NextResponse.json({ error: `Photo upload failed: ${errMsg}` }, { status: 500 })
  }
}
