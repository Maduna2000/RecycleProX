/**
 * Build-time guardrail: fails the build if a NEW API route touching
 * Prisma/services resolves tenantId without runWithRequestTenant(req, fn) —
 * the pattern that produced the MissingTenantContextError incidents (see
 * i-need-you-to-vectorized-pumpkin.md Section 12).
 *
 * This is a ratchet, not a one-shot check: scripts/tenant-wrapping-baseline.txt
 * tracks the still-unwrapped routes left over from before this guardrail
 * existed, so mid-remediation deploys aren't blocked. Only a route that is
 * unwrapped AND absent from the baseline fails the build — i.e. a brand new
 * route added later without the wrap. As routes get fixed, remove their
 * lines from the baseline file in the same PR; do not add new lines to it.
 *
 * Run manually: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/check-tenant-wrapping.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..')
const API_DIR = join(ROOT, 'src', 'app', 'api')
const BASELINE_FILE = join(__dirname, 'tenant-wrapping-baseline.txt')

// Routes that legitimately resolve tenant context a different way and must
// NOT be wrapped with runWithRequestTenant (it would break them — no
// x-tenant-id header is set on these requests). See Section 12.
// Forward slashes always, deliberately not path.join() — relPath below is
// normalized to forward slashes regardless of OS, so the prefixes must
// match that, not the platform's native separator (path.join() would give
// backslashes on Windows, silently failing every prefix check there while
// still working on Vercel's Linux build machines).
const ALLOWLIST_PREFIXES = [
  'src/app/api/internal',
  'src/app/api/mobile',
  'src/app/api/sync',
  'src/app/api/auth',
  'src/app/api/ping',
  'src/app/api/r2/test',
  // supportTicketClient.ts is a pure HTTP client calling the Portal's
  // internal API (fetch, no Prisma) — matched the DB-touching grep only
  // because it imports from @/lib/services/, not because it needs tenant
  // context. A grep-pipeline false positive, not a gap.
  'src/app/api/support-tickets',
]

function findRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...findRouteFiles(full))
    } else if (entry === 'route.ts') {
      out.push(full)
    }
  }
  return out
}

function isAllowlisted(relPath: string): boolean {
  return ALLOWLIST_PREFIXES.some((prefix) => relPath.startsWith(prefix))
}

function touchesDb(content: string): boolean {
  return /from '@\/lib\/services\/|from '@\/lib\/db\/prisma'/.test(content)
}

function isWrapped(content: string): boolean {
  return content.includes('runWithRequestTenant')
}

function loadBaseline(): Set<string> {
  const raw = readFileSync(BASELINE_FILE, 'utf-8')
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
  return new Set(lines)
}

function main() {
  const allRoutes = findRouteFiles(API_DIR)
  const baseline = loadBaseline()

  const currentlyUnwrapped: string[] = []
  for (const abs of allRoutes) {
    const relPath = relative(ROOT, abs).split('\\').join('/')
    if (isAllowlisted(relPath)) continue

    const content = readFileSync(abs, 'utf-8')
    if (!touchesDb(content)) continue
    if (!isWrapped(content)) currentlyUnwrapped.push(relPath)
  }

  const currentlyUnwrappedSet = new Set(currentlyUnwrapped)
  const newRegressions = currentlyUnwrapped.filter((f) => !baseline.has(f))
  const staleBaselineEntries = Array.from(baseline).filter((f) => !currentlyUnwrappedSet.has(f))

  if (staleBaselineEntries.length > 0) {
    console.log(
      `[check-tenant-wrapping] Info: ${staleBaselineEntries.length} baseline entr${staleBaselineEntries.length === 1 ? 'y is' : 'ies are'} ` +
        `already fixed — please remove from scripts/tenant-wrapping-baseline.txt:`,
    )
    for (const f of staleBaselineEntries) console.log(`  - ${f}`)
  }

  if (newRegressions.length > 0) {
    console.error(
      `[check-tenant-wrapping] FAIL: ${newRegressions.length} route(s) touch Prisma/services but don't call ` +
        `runWithRequestTenant(req, fn), and aren't in the known baseline (scripts/tenant-wrapping-baseline.txt):`,
    )
    for (const f of newRegressions) console.error(`  - ${f}`)
    console.error(
      '\nWrap the tenant-scoped call(s) in runWithRequestTenant(req, () => ...) — see any already-fixed route ' +
        '(e.g. src/app/api/scale/orders/route.ts) for the exact pattern. If this route genuinely resolves tenant ' +
        'context another way (internal/mobile/sync-style), add it to ALLOWLIST_PREFIXES in this script instead of ' +
        'the baseline file.',
    )
    process.exit(1)
  }

  console.log(
    `[check-tenant-wrapping] OK — no new unwrapped routes (${baseline.size} known pre-existing, tracked in the baseline).`,
  )
}

main()
