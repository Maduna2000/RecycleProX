/**
 * Packages a standalone, self-contained "local hardware-bridge server"
 * folder — the same production-targeted (Postgres) Next.js build Vercel
 * runs, meant to be copied to a shop-floor PC and run there so its
 * scale/printer API routes can reach hardware on that machine's local
 * ports/LAN. Unlike scripts/build-desktop.ts, there is no Prisma
 * client-swapping dance here — this deliberately reuses the exact same
 * Postgres client as the Vercel deploy, since this mode points at the same
 * shared production database, not an isolated local SQLite copy.
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
const DIST = path.join(ROOT, 'dist', 'local-server')
const STANDALONE_DIR = path.join(DIST, 'standalone')

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
  console.log('--- 1/6: regenerating the Postgres Prisma client (defends against a stale desktop-build client swap) ---')
  run('npx', ['prisma', 'generate'])

  console.log('--- 2/6: next build ---')
  run('npx', ['next', 'build'])

  console.log('--- 3/6: resetting the standalone build output ---')
  // Only standalone/ — never the whole DIST folder. local-server.env lives
  // as a DIST sibling and is operator-maintained, filled in by hand after
  // copying from local-server.env.example; it's not build output and must
  // survive a rebuild, unlike everything under standalone/ which really is
  // regenerated fresh every time.
  fs.rmSync(STANDALONE_DIR, { recursive: true, force: true })
  fs.mkdirSync(STANDALONE_DIR, { recursive: true })

  console.log('--- 4/6: copying the standalone server + assets not auto-traced by Next.js ---')
  copyIfExists(path.join(ROOT, '.next', 'standalone'), STANDALONE_DIR)
  copyIfExists(path.join(ROOT, '.next', 'static'), path.join(STANDALONE_DIR, '.next', 'static'))
  copyIfExists(path.join(ROOT, 'public'), path.join(STANDALONE_DIR, 'public'))

  console.log('--- 5/6: defensively re-copying native/dynamically-resolved modules ---')
  // Next's output-file tracing can miss these: the Prisma query engine has
  // documented standalone-tracing gaps, and @serialport/bindings-cpp
  // resolves its prebuilt binary path dynamically at runtime via
  // node-gyp-build (not statically analyzable), so static tracing has
  // nothing to follow.
  for (const mod of ['.prisma', '@prisma/client', 'serialport', '@serialport', 'node-thermal-printer']) {
    copyIfExists(path.join(ROOT, 'node_modules', mod), path.join(STANDALONE_DIR, 'node_modules', mod))
  }

  const serverJs = path.join(STANDALONE_DIR, 'server.js')
  if (!fs.existsSync(serverJs)) {
    console.error(`FAILED: ${serverJs} does not exist — next build did not produce a usable standalone output.`)
    process.exit(1)
  }

  console.log('--- 6/6: copying launcher scripts + env template + README ---')
  const scriptsDir = path.join(ROOT, 'scripts', 'local-server')
  for (const file of ['launcher.ps1', 'install-task.ps1', 'uninstall-task.ps1', 'local-server.env.example', 'README.md']) {
    copyIfExists(path.join(scriptsDir, file), path.join(DIST, file))
  }

  console.log(`\nDone. Self-contained folder ready at: ${DIST}`)
  console.log('Zip that folder and copy it to the target PC, or run it in place.')
}

main()
