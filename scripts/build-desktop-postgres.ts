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
import fs from 'node:fs'
import path from 'node:path'

// process.cwd() rather than __dirname — see the identical note in
// build-desktop.ts and generate-sqlite-schema.ts.
const ROOT = process.cwd()

function run(command: string, args: string[]) {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: true })
}

/** Recursive copy that skips a source that doesn't exist, rather than throwing. */
function copyIfExists(src: string, dest: string) {
  if (!fs.existsSync(src)) {
    console.log(`  (skip — not found) ${src}`)
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
  console.log(`  copied ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dest)}`)
}

function main() {
  console.log('--- 1/3: regenerating the Postgres Prisma client (defends against a stale SQLite-build client swap) ---')
  run('npx', ['prisma', 'generate'])

  console.log('--- 2/3: next build ---')
  run('npx', ['next', 'build'])

  console.log('--- 3/3: copying static assets Next.js standalone output does not include ---')
  // This is the script npm run build:desktop / electron:build actually
  // invokes (see package.json) — build-desktop.ts (SQLite variant) is not
  // currently wired up to anything. Next.js's own docs call this out
  // explicitly: `output: 'standalone'` traces server-side dependencies but
  // does NOT copy .next/static or public/ into .next/standalone — the
  // server that runs from there won't find them unless something copies
  // them in first. Without this step the packaged app's server.js looks
  // for static assets at .next/standalone/.next/static (relative to
  // itself), which never exists — every CSS/JS request 404s silently and
  // the app renders as unstyled raw HTML with no working JavaScript.
  // Mirrors scripts/local-server/assemble.ts's identical copy step for the
  // other standalone deployment target.
  const standaloneDir = path.join(ROOT, '.next', 'standalone')
  copyIfExists(path.join(ROOT, '.next', 'static'), path.join(standaloneDir, '.next', 'static'))
  copyIfExists(path.join(ROOT, 'public'), path.join(standaloneDir, 'public'))

  console.log('--- 4/4: defensively re-copying native/dynamically-resolved modules ---')
  // Confirmed by actually running the packaged app's server.js: login 500'd
  // with "Cannot find module '.prisma/client/default'" — node_modules/.prisma
  // was completely absent from the installed app, even though
  // package.json's electron-builder `files` array explicitly lists
  // "node_modules/.prisma/**/*". electron-builder's glob matching does not
  // include dot-prefixed path segments (like .prisma) by default, so that
  // entry silently matched nothing — @prisma/client itself (no leading dot)
  // got bundled fine, but the actual generated client output never did.
  // Copying it directly here bypasses electron-builder's glob entirely, the
  // same way scripts/local-server/assemble.ts already does for this exact
  // reason. serialport/node-thermal-printer ride along too — they resolve
  // prebuilt binaries dynamically at runtime (not statically analyzable),
  // so Next's own output tracing has nothing to follow for them either.
  for (const mod of ['.prisma', '@prisma/client', 'serialport', '@serialport', 'node-thermal-printer']) {
    copyIfExists(path.join(ROOT, 'node_modules', mod), path.join(standaloneDir, 'node_modules', mod))
  }

  console.log('Desktop build ready — run electron-builder next.')
}

main()
