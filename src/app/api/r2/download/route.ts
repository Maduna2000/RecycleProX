import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getR2Client, R2_BUCKET } from '@/lib/r2/client'

// Same-origin proxy for R2 objects, used instead of a presigned URL where the
// caller needs a forced download rather than an inline view — a presigned R2
// URL is cross-origin and carries no app-controlled Content-Disposition, so
// Safari just renders it inline with no way to save it.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  const filename = req.nextUrl.searchParams.get('filename') ?? 'document'
  if (!key) return NextResponse.json({ error: 'key parameter required' }, { status: 400 })

  try {
    const client = getR2Client()
    const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    if (!res.Body) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const chunks: Uint8Array[] = []
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0)
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': res.ContentType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (err) {
    logger.error({ err, key }, 'GET /api/r2/download failed')
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }
}
