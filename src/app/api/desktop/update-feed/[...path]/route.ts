import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { fetchR2Bytes } from '@/lib/r2'

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
// prefix — CI uploads them via POST /api/internal/desktop-release (shared-
// secret gated) after each desktop build; nothing else writes here.
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
