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

  const bytes      = new Uint8Array(await file.arrayBuffer())
  const ext        = mimeToExt(file.type)
  const scanR2Key  = `customers/scan-staging/${randomUUID()}.${ext}`

  try {
    await uploadBytes(scanR2Key, bytes, file.type)
    logger.info({ userId: session.user.id, scanR2Key, bytes: file.size }, 'id-scan upload ok')
    return NextResponse.json({ scanR2Key })
  } catch (err) {
    logger.error({ err }, 'POST /api/id-scan — R2 upload failed')
    return NextResponse.json({ error: 'Photo upload failed' }, { status: 500 })
  }
}
