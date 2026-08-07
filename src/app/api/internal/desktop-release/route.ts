import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'
import { uploadBytes } from '@/lib/r2'

// POST /api/internal/desktop-release
// Server-to-server only — called by .github/workflows/build-desktop.yml
// right after a desktop installer build, once per output file (the
// installer .exe, its .blockmap, and latest.yml). Stores each under
// desktop-releases/<filename> in R2, which
// GET /api/desktop/update-feed/[...path] then serves publicly — this is
// the only writer of that prefix.
//
// multipart/form-data with a single `file` field; the filename comes from
// the uploaded file's own name (electron-builder's own output filenames,
// not attacker-controlled — this route is shared-secret gated, not public).
export async function POST(req: NextRequest) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || !file.name) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = file.name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream'

  await uploadBytes(`desktop-releases/${file.name}`, bytes, contentType)

  logger.info({ filename: file.name, bytes: bytes.byteLength }, 'desktop.release.uploaded')
  return NextResponse.json({ success: true, filename: file.name })
}
