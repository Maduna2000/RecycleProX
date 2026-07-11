/**
 * Mechanically derives prisma/schema.sqlite.prisma from prisma/schema.prisma
 * for the Renovo Pro Desktop build. Not symlinks (fragile for multi-file
 * Prisma setups on Windows dev machines) — a plain codegen script, run via
 * `npm run generate:sqlite` before any Electron build/dev.
 *
 * schema.prisma (Postgres) stays the single source of truth and the default
 * Prisma reads everywhere else in this repo (Vercel build, `prisma generate`,
 * `prisma migrate`, CI) — nothing here changes that file or how it's
 * invoked. This script only ever writes schema.sqlite.prisma, which is
 * loaded explicitly via `--schema=prisma/schema.sqlite.prisma` by
 * Electron-specific scripts.
 *
 * Transformations applied (see SaaS plan section C.2 for the reasoning):
 *  - datasource swapped to sqlite
 *  - every field typed as one of the Postgres schema's enums becomes String
 *    (SQLite has no native enum type in Prisma) — safe because CLAUDE.md
 *    rule #3 already mandates Zod validation before every DB call, so
 *    enforcement never depended on the DB-level enum
 *  - `enum X { ... }` blocks themselves are dropped from the output (no
 *    longer referenced by any field)
 *  - `@db.Decimal(x, y)` and `@db.Date` attributes are stripped —
 *    Postgres-specific native-type annotations; SQLite's Prisma connector
 *    has no native-type system and maps Decimal/DateTime without them
 *  - every `Json`/`Json?` field becomes a JSON-encoded String column —
 *    contrary to what the SaaS plan assumed, Prisma 5.22's SQLite connector
 *    does not support the Json scalar type at all (confirmed by running
 *    `prisma validate` against a first draft of this script), so these get
 *    the same treatment as the scalar-list fields below
 *  - the String[] scalar-list fields (photoR2Keys, on four different
 *    models) become a JSON-encoded String column (SQLite's Prisma connector
 *    has no list-scalar support at all) — see
 *    src/lib/offline/photoKeysCodec.ts and jsonFieldCodec.ts for the shared
 *    encode/decode
 *  - prisma/schema.sqlite-extra.prisma (SQLite-only sync tables) is
 *    appended verbatim — its own fields must independently avoid Json/enum
 *    types for the same reasons
 *  - the generator block gets its own `output` path
 *    (node_modules/.prisma/sqlite-client) — both schemas default to the
 *    same node_modules/@prisma/client path otherwise, and generating one
 *    silently overwrites the other's already-generated client with no
 *    warning (confirmed by hand while building this script)
 */
import fs from 'node:fs'
import path from 'node:path'

// process.cwd() rather than __dirname — this file runs under Node's native
// TS type-stripping in some environments (Node 22+), which executes it as
// an ES module where __dirname doesn't exist. Always invoked from the repo
// root (npm script / npx ts-node from RecycleProX/), so cwd is reliable.
const ROOT = process.cwd()
const SOURCE_PATH = path.join(ROOT, 'prisma', 'schema.prisma')
const EXTRA_PATH = path.join(ROOT, 'prisma', 'schema.sqlite-extra.prisma')
const OUTPUT_PATH = path.join(ROOT, 'prisma', 'schema.sqlite.prisma')

// Every String[] field known to exist today (see SaaS plan section C.2).
// Deliberately an explicit list, not a blanket "any String[] field" rule —
// a newly-added scalar-list field should fail loudly (this script would
// leave it untouched, and `prisma validate` on the sqlite schema would then
// error) rather than silently doing the wrong thing for a field nobody
// checked yet.
const SCALAR_LIST_FIELDS = new Set([
  'photoR2Keys',
])

// Postgres-only models with no meaning on a single-tenant local install.
// Tenant is the schema-per-tenant registry (subdomain -> Postgres schema) —
// a Desktop install already belongs to exactly one company by definition,
// so there is nothing for it to register or look up.
const EXCLUDED_MODELS = new Set([
  'Tenant',
])

function stripExcludedModels(schema: string): string {
  let result = schema
  for (const modelName of Array.from(EXCLUDED_MODELS)) {
    const re = new RegExp(`(?:\\/\\/[^\\n]*\\n)*model\\s+${modelName}\\s*\\{[^}]*\\}\\n?`, 'g')
    result = result.replace(re, '')
  }
  return result
}

function parseEnums(schema: string): Map<string, string[]> {
  const enums = new Map<string, string[]>()
  const enumBlockRe = /enum\s+(\w+)\s*\{([^}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = enumBlockRe.exec(schema))) {
    const name = match[1]
    const body = match[2]
    if (!name || !body) continue
    const values = body
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim()) // strip trailing "// comment"
      .filter((l) => l.length > 0)
    enums.set(name, values)
  }
  return enums
}

function stripEnumBlocks(schema: string): string {
  return schema.replace(/enum\s+\w+\s*\{[^}]*\}\n?/g, '')
}

function swapDatasource(schema: string): string {
  return schema.replace(
    /datasource db \{[^}]*\}/,
    'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}',
  )
}

// Both schemas' generator blocks default to the same node_modules/@prisma/client
// output path — generating one silently clobbers the other's already-generated
// client. Confirmed by hand: running `prisma generate --schema=schema.sqlite.prisma`
// overwrote the Postgres-typed client that `next dev`/`next build` import from,
// with no warning. Giving the SQLite client its own output path is what keeps
// `npm run generate:sqlite` safe to run at any time without also having to
// remember to re-run a plain `prisma generate` afterward.
function setDistinctClientOutput(schema: string): string {
  return schema.replace(
    /generator client \{/,
    'generator client {\n  output        = "../node_modules/.prisma/sqlite-client"',
  )
}

function stripDecimalAttribute(schema: string): string {
  return schema.replace(/\s*@db\.Decimal\(\d+,\s*\d+\)/g, '')
}

function stripDateAttribute(schema: string): string {
  // SQLite's connector has no native-type system at all (no @db.Date,
  // @db.Decimal, etc.) — DateTime columns already store full timestamps
  // fine without it.
  return schema.replace(/\s*@db\.Date\b/g, '')
}

// Prisma 5.22's SQLite connector doesn't support the Json scalar type at
// all (unlike Postgres/MySQL) — every Json field becomes a JSON-encoded
// String column, same pattern as the String[] scalar-list fields. Callers
// go through the shared codec in src/lib/offline/jsonFieldCodec.ts.
function convertJsonFields(schema: string): string {
  return schema.replace(/(\n\s*\w+\s+)Json(\?)?/g, '$1String$2')
}

function convertEnumFields(schema: string, enums: Map<string, string[]>): string {
  let result = schema
  for (const [enumName, values] of Array.from(enums)) {
    // Field type usage: "  fieldName   EnumName" or "  fieldName   EnumName?"
    // optionally followed by attributes on the same line, e.g.
    // "@default(open)". Word-boundaried so e.g. "UserRole" doesn't also
    // match inside an unrelated longer identifier.
    const fieldTypeRe = new RegExp(`(\\n\\s*\\w+\\s+)${enumName}(\\??)(\\s)`, 'g')
    result = result.replace(fieldTypeRe, '$1String$2$3')

    // Unquoted enum default values, e.g. @default(open) -> @default("open").
    // Scoped to this enum's actual values so we never misfire on an
    // unrelated @default(...) elsewhere in the file.
    for (const value of values) {
      const defaultRe = new RegExp(`@default\\(${value}\\)`, 'g')
      result = result.replace(defaultRe, `@default("${value}")`)
    }
  }
  return result
}

function convertScalarListFields(schema: string): string {
  let result = schema
  for (const fieldName of Array.from(SCALAR_LIST_FIELDS)) {
    // Matches "  photoR2Keys   String[]" and "  photoR2Keys   String[] @default([])"
    const re = new RegExp(`(\\n\\s*${fieldName}\\s+)String\\[\\](\\s*@default\\(\\[\\]\\))?`, 'g')
    result = result.replace(re, `$1String  @default("[]")`)
  }
  return result
}

function main() {
  // Normalize CRLF -> LF up front. Left as-is, a trailing \r survives every
  // per-line .split('\n') below, and \r counts as a regex line terminator
  // in JS — "." stops before it, so any `.*$` pattern (e.g. stripping a
  // trailing "// comment") silently fails to match on a CRLF-saved file.
  const source = fs.readFileSync(SOURCE_PATH, 'utf-8').replace(/\r\n/g, '\n')
  const enums = parseEnums(source)

  let output = source
  output = stripExcludedModels(output)
  output = swapDatasource(output)
  output = setDistinctClientOutput(output)
  output = stripDecimalAttribute(output)
  output = stripDateAttribute(output)
  output = convertEnumFields(output, enums)
  output = convertScalarListFields(output)
  output = convertJsonFields(output)
  output = stripEnumBlocks(output)

  const banner =
    '// AUTO-GENERATED by scripts/generate-sqlite-schema.ts — do not edit by hand.\n' +
    '// Source of truth is prisma/schema.prisma. Re-run `npm run generate:sqlite`\n' +
    '// after any change there.\n\n'

  const extra = fs.existsSync(EXTRA_PATH) ? '\n' + fs.readFileSync(EXTRA_PATH, 'utf-8') : ''

  fs.writeFileSync(OUTPUT_PATH, banner + output.trimEnd() + '\n' + extra)

  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${enums.size} enums converted to String, ${SCALAR_LIST_FIELDS.size} scalar-list fields converted to JSON string)`)
}

main()
