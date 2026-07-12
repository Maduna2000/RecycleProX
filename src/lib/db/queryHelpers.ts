import { isSqlite } from './provider'

// Case-insensitive `contains` filter. Postgres needs `mode: 'insensitive'`
// explicitly; SQLite's Prisma connector doesn't support that option at all
// (it's not in the generated type, and passing it fails validation at
// runtime too) — but SQLite's own `LIKE`, which `contains` compiles to,
// is already case-insensitive for ASCII by default, so simply omitting the
// option there produces the same practical behavior.
//
// Typed as `any` deliberately: this is the one place in the codebase where
// the exact filter shape has to differ by provider, and TypeScript's
// excess-property checking only fires on object literals assigned
// directly — routing through a function return sidesteps it cleanly
// without weakening anything callers can't already get wrong themselves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ciContains(value: string): any {
  return isSqlite() ? { contains: value } : { contains: value, mode: 'insensitive' }
}

// Json-typed columns on Postgres become JSON-encoded String columns on
// SQLite (Prisma 5.22's SQLite connector has no Json scalar support at all —
// see scripts/generate-sqlite-schema.ts). Services writing/reading a Json
// field should go through these rather than assuming either shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function encodeJsonField(value: unknown): any {
  return isSqlite() ? JSON.stringify(value) : value
}

export function decodeJsonField<T = unknown>(value: unknown): T {
  if (isSqlite() && typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return value as T
    }
  }
  return value as T
}
