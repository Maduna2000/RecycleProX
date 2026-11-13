import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { fetchR2Bytes, getViewUrl, objectExists } from '@/lib/r2'
import { isAllowedReleaseFilename } from '@/lib/desktopRelease/validate'

// GET /api/desktop/update-feed/<file>
// Serves the Electron desktop app's auto-update feed — electron-updater's
// "generic" provider fetches latest.yml from here, parses it, then fetches
// whichever installer/blockmap file it references, resolved against this
// same base URL (see electron/main.js's autoUpdater setup and
// package.json's build.publish config).
//
// Deliberately unauthenticated: a freshly installed till has no session yet
// and this needs to be reachable before any login happens, same as the
// installer download itself already is. Files live in the same (otherwise
// private) R2 bucket as everything else under a dedicated desktop-releases/
// prefix — CI publishes latest.yml via POST /api/internal/desktop-release and
// uploads the installer/.blockmap straight to R2 through a presigned link from
// POST /api/internal/desktop-release/presign (both gated by the CI-only
// DESKTOP_RELEASE_UPLOAD_SECRET); nothing else writes here.
//
// The installer is far larger than a serverless response body can be, so
// .exe / .blockmap requests are answered with a redirect to a short-lived
// presigned R2 download link (electron-updater follows redirects, and R2 serves
// the Range requests used for differential downloads). Only the tiny
// latest.yml is served directly from here.
const RELEASES_PREFIX = 'desktop-releases/'

function contentTypeFor(filename: string): string {
  if (filename.endsWith('.yml') || filename.endsWith('.yaml')) return 'text/yaml; charset=utf-8'
  return 'application/octet-stream'
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params

  // No path traversal, no reaching outside the releases prefix — every
  // segment must be a plain filename component.
  if (segments.some((s) => !s || s.includes('..') || s.includes('/') || s.includes('\\'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const filename = segments.join('/')
  const key = `${RELEASES_PREFIX}${filename}`

  // Only the files CI publishes — anything else under this prefix (or any
  // other name) is simply not found.
  if (!isAllowedReleaseFilename(filename)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (filename !== 'latest.yml') {
    if (!(await objectExists(key))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const url = await getViewUrl(key, 15 * 60)
    logger.info({ filename }, 'desktop.update-feed.redirected')
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
  }

  const bytes = await fetchR2Bytes(key)
  if (!bytes) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  logger.info({ filename }, 'desktop.update-feed.served')

  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

  return new NextResponse(body, {
    headers: {
      'Content-Type':   contentTypeFor(filename),
      'Content-Length': String(bytes.byteLength),
      // Update metadata must never be served stale from an intermediary
      // cache — a till checking for updates should always see the latest
      // published version.
      'Cache-Control':  'no-store',
    },
  })
}
