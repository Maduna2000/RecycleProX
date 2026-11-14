import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { authorizeReleaseUploadRequest } from '@/lib/internal/authorizeInternalRequest'
import { validateLatestYml, MAX_LATEST_YML_BYTES } from '@/lib/desktopRelease/validate'
import { uploadBytes } from '@/lib/r2'

// POST /api/internal/desktop-release
// Server-to-server only — called by .github/workflows/build-desktop.yml. Stores
// latest.yml (and only latest.yml) under desktop-releases/ in R2, which
// GET /api/desktop/update-feed/[...path] serves publicly. The large installer
// and its .blockmap do NOT come through here (a serverless request body is
// capped at a few MB): CI gets a presigned link from
// POST /api/internal/desktop-release/presign and uploads them straight to R2.
//
// latest.yml is the one file every till trusts, so it is the one that is
// validated: it may only reference plain installer file names, never an
// absolute URL or a path, so even a leaked upload secret cannot point the
// updater at a file hosted elsewhere. Authenticated with
// DESKTOP_RELEASE_UPLOAD_SECRET (CI-only), NOT the INTERNAL_API_SHARED_SECRET
// every till holds — see authorizeReleaseUploadRequest.
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

  if (file.name !== 'latest.yml') {
    logger.warn({ filename: file.name }, 'desktop.release.rejected-filename')
    return NextResponse.json(
      { error: 'Only latest.yml is accepted here — upload the installer and .blockmap via /api/internal/desktop-release/presign' },
      { status: 400 },
    )
  }

  if (file.size > MAX_LATEST_YML_BYTES) {
    return NextResponse.json({ error: 'latest.yml is too large' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateLatestYml(new TextDecoder().decode(bytes))
  if (!check.ok) {
    logger.warn({ reason: check.reason }, 'desktop.release.rejected-latest-yml')
    return NextResponse.json({ error: check.reason }, { status: 400 })
  }
  await uploadBytes(`desktop-releases/${file.name}`, bytes, 'text/yaml')

  logger.info({ filename: file.name, bytes: bytes.byteLength }, 'desktop.release.uploaded')
  return NextResponse.json({ success: true, filename: file.name })
}
