/**
 * Builds the standalone Next.js server electron-builder packages for the
 * Postgres-direct desktop deployment (see electron/main.js's loadDesktopEnv).
 * Unlike scripts/build-desktop.ts, there is no Prisma client-swapping dance —
 * this deliberately reuses the exact same Postgres client as the Vercel
 * deploy and scripts/local-server/assemble.ts, since this mode points at the
 * same shared production database, not an isolated local SQLite copy.
 *
 * A Node script rather than a shell one-liner for the same portability
 * reason as build-desktop.ts (Windows cmd.exe doesn't support inline
 * `VAR=x command` env-var syntax).
 */
import { execFileSync } from 'node:child_process'

// process.cwd() rather than __dirname — see the identical note in
// build-desktop.ts and generate-sqlite-schema.ts.
const ROOT = process.cwd()

function run(command: string, args: string[]) {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: true })
}

function main() {
  console.log('--- 1/2: regenerating the Postgres Prisma client (defends against a stale SQLite-build client swap) ---')
  run('npx', ['prisma', 'generate'])

  console.log('--- 2/2: next build ---')
  run('npx', ['next', 'build'])

  console.log('Desktop build ready — run electron-builder next.')
}

main()
