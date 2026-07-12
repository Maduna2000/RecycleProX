import { isSqlite } from '@/lib/db/provider'

// Shared encode/decode for the `photoR2Keys` field, which is a native
// Postgres String[] on Web but a JSON-encoded String column on Desktop's
// SQLite schema (see scripts/generate-sqlite-schema.ts — SQLite's Prisma
// connector has no scalar-list support at all). This is provider-aware
// itself (not just a Desktop-only helper) because the services that call it
// — scaleService.ts, purchaseService.ts, saleService.ts — are shared code
// that runs on both Web and Desktop; unconditionally JSON-encoding would
// silently write a string into Web's real array column.
//
// Typed `any` on the way out for the same reason as queryHelpers.ts's
// helpers: the exact shape genuinely differs by provider (string vs
// string[]), and routing through a function return avoids tripping
// TypeScript's excess-property/literal-assignability checks at every call
// site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function encodePhotoKeys(keys: string[]): any {
  return isSqlite() ? JSON.stringify(keys) : keys
}

export function decodePhotoKeys(value: string[] | string | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
