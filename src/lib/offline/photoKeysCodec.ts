// Shared encode/decode for the `photoR2Keys` field, which is a native
// Postgres String[] on Web but a JSON-encoded String column on Desktop's
// SQLite schema (see scripts/generate-sqlite-schema.ts — SQLite's Prisma
// connector has no scalar-list support at all). Services that read/write
// this field on Desktop should go through these two functions rather than
// assuming either shape directly.
export function encodePhotoKeys(keys: string[]): string {
  return JSON.stringify(keys)
}

export function decodePhotoKeys(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
