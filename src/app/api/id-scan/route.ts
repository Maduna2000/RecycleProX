import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { randomUUID } from 'crypto'
import { uploadBytes, mimeToExt, ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from '@/lib/r2'
import logger from '@/lib/logger'

// POST /api/id-scan
// Accepts a photo of an ID document via multipart/form-data.
// Runs server-side Tesseract OCR, uploads the photo to R2 staging, and returns
// extracted fields + the R2 key so the caller can link it to a customer later.
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
    return NextResponse.json({ error: `Unsupported file type. Allowed: ${ALLOWED_PHOTO_TYPES.join(', ')}` }, { status: 422 })
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'File too large — maximum 10 MB' }, { status: 422 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext   = mimeToExt(file.type)
  const scanR2Key = `customers/scan-staging/${randomUUID()}.${ext}`

  // Upload the photo to R2 first so we always have the image even if OCR fails
  try {
    await uploadBytes(scanR2Key, bytes, file.type)
  } catch (err) {
    logger.error({ err }, 'POST /api/id-scan — R2 upload failed')
    return NextResponse.json({ error: 'Photo upload failed' }, { status: 500 })
  }

  // ── Server-side OCR ───────────────────────────────────────────────────────

  let idNumber:  string | null = null
  let firstName: string | null = null
  let lastName:  string | null = null

  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng', 1, { logger: () => {} })
    try {
      const { data: { text } } = await worker.recognize(Buffer.from(bytes))
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

      const extractAfterLabel = (labels: string[]): string | null => {
        for (const label of labels) {
          const upper = label.toUpperCase()
          const idx = lines.findIndex((l) => l.toUpperCase().startsWith(upper))
          if (idx !== -1) {
            const rest = lines[idx]!.substring(label.length).replace(/^[:/\s]+/, '').trim()
            if (rest.length > 1) return rest
            if (lines[idx + 1]) return lines[idx + 1]!.trim()
          }
        }
        return null
      }

      // SA Smart ID & Green ID Book: try 13-digit regex first (most reliable)
      const match13 = text.match(/\b\d{13}\b/)
      if (match13) {
        idNumber = match13[0]
      } else {
        const raw = extractAfterLabel([
          'IDENTITY NUMBER', 'IDENTITEITSNOMMER',
          'NATIONAL IDENTITY NUMBER',
          'ID NUMBER', 'ID NO', 'ID:',
        ])
        if (raw) idNumber = raw.replace(/\s/g, '').toUpperCase()
      }

      firstName = extractAfterLabel([
        'NAMES', 'NAME', 'FORENAMES', 'FORENAME',
        'FIRST NAME', 'FIRST NAMES', 'GIVEN NAME', 'GIVEN NAMES',
      ])

      lastName = extractAfterLabel([
        'SURNAME', 'VAN', 'LAST NAME', 'LAST NAMES', 'FAMILY NAME',
      ])

      logger.info({
        userId: session.user.id, scanR2Key,
        extracted: { idNumber, firstName, lastName },
      }, 'id-scan OCR complete')
    } finally {
      await worker.terminate().catch(() => {})
    }
  } catch (err) {
    // OCR failure is non-fatal — return the R2 key so the photo is still saved
    logger.warn({ err, scanR2Key }, 'POST /api/id-scan — OCR failed, returning key only')
  }

  return NextResponse.json({ idNumber, firstName, lastName, scanR2Key })
}
