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
  // binaryTargets in prisma/schema.prisma now explicitly includes
  // "windows" (not just "native"), so a build produced here should still
  // ship a working Windows query engine either way — this is a
  // belt-and-suspenders warning, not a hard requirement, in case that
  // target list ever regresses back to relying on "native" alone.
  if (process.platform !== 'win32') {
    console.warn(
      `WARNING: building the desktop installer from ${process.platform}, not Windows. ` +
      'The production pipeline for this build is .github/workflows/build-desktop.yml ' +
      '(runs on windows-latest) — prefer that over a local build when producing an ' +
      'installer for real users.'
    )
  }

  console.log('--- 1/4: regenerating the Postgres Prisma client (defends against a stale SQLite-build client swap) ---')
  run('npx', ['prisma', 'generate'])

  console.log('--- 2/4: next build ---')
  run('npx', ['next', 'build'])

  console.log('--- 3/4: copying static assets Next.js standalone output does not include ---')
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
  // Populates .next/standalone/node_modules/ with modules Next's own
  // standalone tracing gets wrong or misses — confirmed by actually running
  // the packaged server.js repeatedly, not by inspecting file lists.
  // IMPORTANT: this copy step alone is not sufficient. electron-builder's
  // `files`-array packaging strips these nested node_modules copies back
  // out again during its own packaging pass — confirmed by extracting a
  // real built installer (7z on the NSIS payload) and finding every one of
  // these modules present right here in .next/standalone/node_modules/ at
  // the end of this script, but absent from the same path inside the
  // actual installed app. Only .prisma survived, because (see package.json)
  // it alone was *also* staged via `extraResources`, a separate mechanism
  // electron-builder does not apply the same pruning to. Every module in
  // the loop below needs its own matching extraResources entry in
  // package.json — this copy step just makes sure something real exists at
  // .next/standalone/node_modules/<mod> for that entry's `from` to pick up.
  for (const mod of [
    '.prisma', '@prisma/client', '@prisma/engines', 'serialport', '@serialport', 'node-thermal-printer', 'next',
    // sharp (businessReport.ts's report-photo downscaling) resolves its
    // platform binary dynamically at runtime — the same tracing gap as the
    // modules above, confirmed by the same class of GitHub issues against
    // Next's standalone output. Only the Windows x64 binary is installed
    // here (npm's optionalDependencies already picked it for this CI
    // runner's platform), so only that one needs shipping.
    'sharp', '@img/sharp-win32-x64', '@img/colour',
  ]) {
    copyIfExists(path.join(ROOT, 'node_modules', mod), path.join(standaloneDir, 'node_modules', mod))
  }

  console.log('Desktop build ready — run electron-builder next.')
}

main()
