// Which datasource the currently-running process is actually talking to.
// Web/Portal never set this (always Postgres); electron/main.js sets
// DATABASE_PROVIDER=sqlite on the standalone server child process it spawns
// (see startStandaloneServer). Needed because several query shapes differ
// between the two providers at the *value* level, not just the type level —
// `mode: 'insensitive'` doesn't exist on SQLite, and Json/String[] columns
// become JSON-encoded String columns there (see scripts/generate-sqlite-
// schema.ts) — so the same service code has to build a different query or
// encode/decode differently depending on which one it's actually running
// against, not just satisfy two different generated types.
export const isSqlite = (): boolean => process.env.DATABASE_PROVIDER === 'sqlite'
