import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { authorizeReleaseUploadRequest } from '@/lib/internal/authorizeInternalRequest'
import { isAllowedInstallerFilename, MAX_INSTALLER_BYTES } from '@/lib/desktopRelease/validate'
import { getUploadUrl } from '@/lib/r2'

// POST /api/internal/desktop-release/presign
// Called by .github/workflows/build-desktop.yml for the two LARGE release
// files (the installer .exe and its .blockmap). They cannot be sent through
// this app — serverless request bodies are capped at a few MB — so CI asks
// here for a short-lived, single-file upload link and PUTs the file straight
// to R2.
//
// Same CI-only DESKTOP_RELEASE_UPLOAD_SECRET as /api/internal/desktop-release
// (never the secret every till holds). The link is signed for ONE key and
// the exact byte size CI declared, and expires in 15 minutes, so a leaked link
// can only write that one file at that size.
//
// latest.yml is deliberately NOT available here: it is what every till trusts,
// so it must go through /api/internal/desktop-release, which validates it.
const BodySchema = z.object({
  filename: z.string().min(1).max(200),
  size: z.number().int().positive().max(MAX_INSTALLER_BYTES),
})

const EXPIRES_IN_SECONDS = 15 * 60

export async function POST(req: NextRequest) {
  if (!authorizeReleaseUploadRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Expected { filename, size }' }, { status: 400 })
  }
  const { filename, size } = parsed.data

  if (!isAllowedInstallerFilename(filename)) {
    logger.warn({ filename }, 'desktop.release.presign.rejected-filename')
    return NextResponse.json({ error: 'File name not allowed' }, { status: 400 })
  }

  const contentType = 'application/octet-stream'
  const key = `desktop-releases/${filename}`
  const url = await getUploadUrl({ key, contentType, maxBytes: size, expiresIn: EXPIRES_IN_SECONDS })

  logger.info({ filename, size }, 'desktop.release.presigned')
  return NextResponse.json({ url, contentType, key, expiresIn: EXPIRES_IN_SECONDS })
}
