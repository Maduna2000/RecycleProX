/**
 * Orchestrates the full Electron build: temporarily points the SQLite
 * client at the default node_modules/@prisma/client path (where every
 * `import { PrismaClient } from '@prisma/client'` in the app resolves) so
 * `next build` bakes a SQLite-flavored standalone server, then restores the
 * distinct sqlite-client path and regenerates the normal Postgres client so
 * `npm run dev`/`npm run build` (Web) aren't left pointed at the wrong one.
 *
 * A Node script rather than a chained shell one-liner on purpose — setting
 * env vars inline (`VAR=x command`) works in bash but not in the Windows
 * cmd.exe that `npm run` actually spawns by default on Windows, a
 * portability gap that bit the seed script earlier in this project's
 * history (see prisma/seed.ts's npm script and its `ts-node` config block).
 */
import { execFileSync } from 'node:child_process'

// process.cwd() rather than __dirname — this file runs under Node's native
// TS type-stripping in some environments (Node 22+), which executes it as
// an ES module where __dirname doesn't exist (see the identical note in
// scripts/generate-sqlite-schema.ts). Always invoked from the repo root
// (npm script / npx ts-node from RecycleProX/), so cwd is reliable.
const ROOT = process.cwd()

function run(command: string, args: string[], extraEnv: Record<string, string> = {}) {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  })
}

function main() {
  console.log('--- 1/4: generating SQLite schema targeting the default client path ---')
  run('npx', ['ts-node', 'scripts/generate-sqlite-schema.ts'], { DESKTOP_CLIENT_TARGET: 'default' })
  run('npx', ['prisma', 'generate', '--schema=prisma/sqlite/schema.prisma'])

  console.log('--- 2/4: next build (bakes the SQLite client into .next/standalone) ---')
  run('npx', ['next', 'build'])

  console.log('--- 3/4: restoring the distinct sqlite-client path for normal dev ---')
  run('npx', ['ts-node', 'scripts/generate-sqlite-schema.ts'])
  run('npx', ['prisma', 'generate', '--schema=prisma/sqlite/schema.prisma'])

  console.log('--- 4/4: restoring the default Postgres client Web dev/build expects ---')
  run('npx', ['prisma', 'generate'])

  console.log('Desktop build ready — run electron-builder next.')
}

main()
