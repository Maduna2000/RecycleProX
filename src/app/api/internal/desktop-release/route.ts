import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { authorizeReleaseUploadRequest } from '@/lib/internal/authorizeInternalRequest'
import { isAllowedReleaseFilename, validateLatestYml } from '@/lib/desktopRelease/validate'
import { uploadBytes } from '@/lib/r2'

// POST /api/internal/desktop-release
// Server-to-server only — called by .github/workflows/build-desktop.yml
// right after a desktop installer build, once per output file (the
// installer .exe, its .blockmap, and latest.yml). Stores each under
// desktop-releases/<filename> in R2, which
// GET /api/desktop/update-feed/[...path] then serves publicly — this is
// the only writer of that prefix.
//
// Authenticated with DESKTOP_RELEASE_UPLOAD_SECRET (CI-only), NOT the
// INTERNAL_API_SHARED_SECRET every till holds — see authorizeReleaseUploadRequest.
// On top of that, only electron-builder's own file names are accepted and
// latest.yml may only reference plain installer file names, so a leaked
// secret still cannot point the updater at a file hosted elsewhere.
//
// multipart/form-data with a single `file` field.
export async function POST(req: NextRequest) {
  if (!authorizeReleaseUploadRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || !file.name) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  if (!isAllowedReleaseFilename(file.name)) {
    logger.warn({ filename: file.name }, 'desktop.release.rejected-filename')
    return NextResponse.json({ error: 'File name not allowed' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (file.name === 'latest.yml') {
    const check = validateLatestYml(new TextDecoder().decode(bytes))
    if (!check.ok) {
      logger.warn({ reason: check.reason }, 'desktop.release.rejected-latest-yml')
      return NextResponse.json({ error: check.reason }, { status: 400 })
    }
  }
  const contentType = file.name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream'

  await uploadBytes(`desktop-releases/${file.name}`, bytes, contentType)

  logger.info({ filename: file.name, bytes: bytes.byteLength }, 'desktop.release.uploaded')
  return NextResponse.json({ success: true, filename: file.name })
}
