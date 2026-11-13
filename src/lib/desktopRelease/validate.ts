import { z } from 'zod'

// What POST /api/internal/desktop-release is allowed to store under the
// public update feed. The feed is read by every installed till's auto-updater
// and the installers it points at are executed with no further check, so the
// upload route must be strict about *what* can be published, not only who can
// publish it (defence in depth: even a leaked upload secret must not be able
// to point the updater at a file hosted anywhere else).

export const MAX_LATEST_YML_BYTES = 64 * 1024
// Largest installer/blockmap CI may upload directly to R2 (a presigned PUT is
// signed for one exact size, so this is also the most a leaked link could write).
export const MAX_INSTALLER_BYTES = 600 * 1024 * 1024

const InstallerNameSchema = z.string().regex(/^[A-Za-z0-9._ +-]{1,120}\.exe(\.blockmap)?$/)
const FeedFilenameSchema = z.union([z.literal('latest.yml'), InstallerNameSchema])

/** The big binaries only (installer + blockmap) — uploaded straight to R2 via a presigned URL. */
export function isAllowedInstallerFilename(name: string): boolean {
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false
  return InstallerNameSchema.safeParse(name).success
}

/** Only electron-builder's own outputs: the installer, its blockmap, and latest.yml. */
export function isAllowedReleaseFilename(name: string): boolean {
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false
  return FeedFilenameSchema.safeParse(name).success
}

export type LatestYmlCheck = { ok: true } | { ok: false; reason: string }

// A reference inside latest.yml (`path:` / `url:`) must be a plain file name
// that lives in this same feed — never an absolute URL, a scheme, or a path.
// electron-updater resolves these against the feed's own base URL, but an
// absolute URL would override that base and send every till to a file the
// attacker hosts (with a matching sha512 that they also control).
const PlainReference = /^[A-Za-z0-9._ +%-]{1,200}\.exe$/

export function validateLatestYml(text: string): LatestYmlCheck {
  if (Buffer.byteLength(text, 'utf8') > MAX_LATEST_YML_BYTES) return { ok: false, reason: 'latest.yml is too large' }

  let references = 0
  for (const rawLine of text.split(/\r?\n/)) {
    const m = rawLine.match(/^\s*(?:-\s+)?(url|path):\s*(.*?)\s*$/)
    if (!m) continue
    references++
    const value = m[2]!.replace(/^['"]|['"]$/g, '')
    if (!PlainReference.test(value) || value.includes('..')) {
      return { ok: false, reason: `latest.yml ${m[1]} must be a plain installer file name, got "${value.slice(0, 60)}"` }
    }
  }
  if (references === 0) return { ok: false, reason: 'latest.yml does not reference an installer' }
  return { ok: true }
}
