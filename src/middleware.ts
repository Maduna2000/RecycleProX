/**
 * Edge-compatible middleware — uses authConfig only (no Prisma, no bcrypt).
 * Route protection and redirect logic only — no DB calls.
 */
import NextAuth from 'next-auth'
import { decode } from '@auth/core/jwt'
import { authConfig } from '@/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { findModuleKey } from '@/lib/moduleKeys'

const { auth } = NextAuth(authConfig)

// Must match src/app/api/mobile/session/route.ts's identical function —
// see that file's own comment for why this reads the request's protocol
// rather than NODE_ENV.
function sessionSalt(req: NextRequest): string {
  return req.nextUrl.protocol === 'https:'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'
}

// NextAuth's own `auth()` wrapper (req.auth below) only ever resolves a
// session from the standard browser cookie flow — it has no concept of the
// Bearer-token mobile auth path (see src/app/api/mobile/signin+session/
// route.ts). Guard Station and Scale Station both send an Authorization
// header instead of relying on cookie propagation, so without this
// fallback every gate/scale API call 401s here at the edge, before ever
// reaching the route handler's own auth() call — regardless of how valid
// the mobile token actually is.
async function resolveMobileSession(req: NextRequest): Promise<{ user: SessionUser } | null> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  try {
    const decoded = await decode({ token, secret: process.env.AUTH_SECRET!, salt: sessionSalt(req) })
    if (!decoded?.id || typeof decoded.id !== 'string') return null
    return {
      user: {
        id: decoded.id,
        role: (decoded.role as string) ?? '',
        forcePasswordChange: (decoded.forcePasswordChange as boolean) ?? false,
        allowedModules: (decoded.allowedModules as string[]) ?? [],
        tenantId: (decoded.tenantId as string | undefined) ?? undefined,
        schemaName: (decoded.schemaName as string | undefined) ?? undefined,
        tenantSlug: (decoded.tenantSlug as string | undefined) ?? undefined,
        featureFlags: (decoded.featureFlags as Record<string, boolean> | undefined) ?? undefined,
      },
    }
  } catch {
    return null
  }
}

type SessionUser = {
  id?: string
  role?: string
  forcePasswordChange?: boolean
  allowedModules?: string[]
  tenantId?: string
  schemaName?: string
  tenantSlug?: string
  featureFlags?: Record<string, boolean>
}

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api'])

// Derives a candidate tenant slug from the request hostname, e.g.
// "acme.renovopro.app" -> "acme" against TENANT_BASE_DOMAIN="renovopro.app".
// Returns null for the apex domain, reserved subdomains, and any host that
// doesn't end in the configured base domain (covers localhost/127.0.0.1 in
// dev, where there's no real subdomain to parse) — those all fall through
// to the single default/public-schema tenant, unchanged from today.
function deriveTenantSlugFromHost(hostname: string): string | null {
  const baseDomain = process.env.TENANT_BASE_DOMAIN
  if (!baseDomain) return null
  const host = hostname.split(':')[0] // strip port, if any
  if (!host || host === baseDomain || !host.endsWith(`.${baseDomain}`)) return null
  const slug = host.slice(0, -(`.${baseDomain}`.length))
  if (!slug || slug.includes('.') || RESERVED_SUBDOMAINS.has(slug)) return null
  return slug
}

export default auth(async (req: NextRequest & { auth: { user?: SessionUser } | null }) => {
  const { pathname } = req.nextUrl
  const session = req.auth ?? await resolveMobileSession(req)

  // Dev-only override so subdomain-based tenant login is testable on
  // localhost without wildcard DNS: ?tenant=<slug> on the /login page.
  // Never honored in production — real tenant resolution there is always
  // derived from the actual hostname below.
  const devTenantOverride =
    process.env.NODE_ENV !== 'production' ? req.nextUrl.searchParams.get('tenant') : null
  const tenantSlug = devTenantOverride ?? deriveTenantSlugFromHost(req.nextUrl.hostname)

  // Forwards the session's resolved tenantId to the Node.js runtime via a
  // request header, read back out by requireTenantId() (src/lib/db/
  // tenantContext.ts) using next/headers — NOT via tenantContext's
  // AsyncLocalStorage.enterWith() in src/auth.ts, which was found (live
  // incident, see i-need-you-to-vectorized-pumpkin.md Section 11) to never
  // propagate into the calling route handler's own continuation: an
  // async function's enterWith() call only affects code running inside
  // that same function — code that awaited it resumes in the context that
  // was active before the call, not whatever the callee mutated. Next.js's
  // own request-header propagation (this mechanism) doesn't have that
  // problem — it's Next.js's own request-scoped storage, not ours.
  const forwardedHeaders = new Headers(req.headers)
  if (session?.user?.tenantId) {
    forwardedHeaders.set('x-tenant-id', session.user.tenantId)
  }
  if (tenantSlug) {
    forwardedHeaders.set('x-tenant-slug', tenantSlug)
  }
  const next = () => NextResponse.next({ request: { headers: forwardedHeaders } })

  // Public routes — always allow. /api/internal/ is shared-secret
  // authenticated in its own route handlers (server-to-server calls from
  // the SaaS Portal never carry a session cookie) — see
  // src/app/api/internal/tenants/route.ts. /api/sync/ is device-token
  // authenticated the same way — Desktop's background sync process has no
  // interactive login — see src/lib/services/deviceAuthClient.ts.
  if (pathname.startsWith('/login') ||
      pathname === '/api/r2/test' || pathname === '/scale/login' || pathname === '/gate/login' || pathname === '/ledger/login' ||
      pathname.startsWith('/api/mobile/') || pathname.startsWith('/api/internal/') ||
      pathname.startsWith('/api/sync/')) {
    return next()
  }

  // A session with no tenantId is never valid post-migration (every login
  // path — online, offline-cache, mobile bearer token — attaches one; see
  // auth.ts/authService.ts) but can still exist on disk from before this
  // was true, or from any future bug in one of those paths. Left alone,
  // every downstream tenant-scoped query 500s (MissingTenantContextError)
  // for this token's entire 12h lifetime with nothing to notice — the
  // production incident this comment is here to prevent required a manual
  // logout to clear. Catch it here instead: force a clean re-login the
  // very first request, automatically, no user/developer intervention
  // needed. Clearing the cookie (not just redirecting) stops the same
  // stale token from being replayed on the very next request.
  if (session?.user && !session.user.tenantId) {
    // console, not the pino logger — this file runs in the Edge runtime
    // (see the file-header comment) and pino is Node-only.
    console.error('middleware: session has no tenantId, forcing re-login', { userId: session.user.id })
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json({ error: 'Session invalid — please log in again' }, { status: 401 })
      res.cookies.delete(sessionSalt(req))
      return res
    }
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete(sessionSalt(req))
    return res
  }

  // Tenant-consistency guardrail — stops a session for one company's
  // subdomain being reused on another company's subdomain tab. Only
  // enforced when THIS request actually resolved a real subdomain-derived
  // tenantSlug (respects TENANT_BASE_DOMAIN via deriveTenantSlugFromHost
  // above) — not a naive hostname.split('.')[0], which treats every apex
  // request (e.g. Golden Key's own renovopros.vercel.app, no subdomain at
  // all) as a mismatched "host slug" and redirect-loops every request.
  // session.user.tenantSlug is now populated for every login, including
  // the apex-domain default-tenant path (see resolveDefaultTenant() in
  // authService.ts) — this guardrail must stay inert for exactly that case.
  if (session?.user?.tenantSlug && tenantSlug && tenantSlug !== session.user.tenantSlug) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Police officer portal — staff-launched; any staff role except scale operators/guards
  if (pathname.startsWith('/police')) {
    if (!session) return NextResponse.redirect(new URL('/login', req.url))
    if (session.user?.role === 'scale_operator') {
      return NextResponse.redirect(new URL('/scale', req.url))
    }
    if (session.user?.role === 'security_guard') {
      return NextResponse.redirect(new URL('/gate', req.url))
    }
    return next()
  }

  // API routes — 401 if no session (individual routes do full role checks)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    return next()
  }

  // Scale station operator routes — restricted to scale_operator + admin + manager,
  // plus any cashier explicitly granted /app/scale via the same per-user
  // allowedModules mechanism every other module already uses. Note: the
  // separate /app/scale REVIEW page inside the main shell (a different
  // surface from this kiosk) is NOT in MODULE_KEYS below, so it's already
  // reachable by any manager/cashier regardless of allowedModules — left
  // that way deliberately rather than newly gating it, since at least one
  // live cashier account has a restricted module list that doesn't include
  // it and may already rely on that page being open.
  if (pathname.startsWith('/scale') && !pathname.startsWith('/scale/admin')) {
    if (!session) return NextResponse.redirect(new URL('/scale/login', req.url))
    const role = session.user?.role
    const grantedScaleAccess = (session.user?.allowedModules ?? []).includes('/app/scale')
    if (!['scale_operator', 'admin', 'manager'].includes(role ?? '') && !grantedScaleAccess) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return next()
  }

  // Scale admin routes — admin + manager only
  if (pathname.startsWith('/scale/admin')) {
    if (!session) return NextResponse.redirect(new URL('/login', req.url))
    const role = session.user?.role
    if (!['admin', 'manager'].includes(role ?? '')) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return next()
  }

  // Gate Security kiosk routes — restricted to security_guard + admin + manager,
  // plus any cashier explicitly granted /app/gate (see the matching comment
  // on the /scale block above — same mechanism, same caveat about the
  // separate, deliberately-ungated /app/gate review page).
  if (pathname.startsWith('/gate')) {
    if (!session) return NextResponse.redirect(new URL('/gate/login', req.url))
    const role = session.user?.role
    const grantedGateAccess = (session.user?.allowedModules ?? []).includes('/app/gate')
    if (!['security_guard', 'admin', 'manager'].includes(role ?? '') && !grantedGateAccess) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return next()
  }

  // Ledger sub-app — admin-only, no allowedModules grant fallback (unlike
  // Scale/Gate). Ledger exposes real financial figures across the whole
  // business, not a single kiosk workflow someone can be individually
  // granted into.
  if (pathname.startsWith('/ledger')) {
    if (!session) return NextResponse.redirect(new URL('/ledger/login', req.url))
    if (session.user?.role !== 'admin') {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return next()
  }

  // App routes — redirect to login if no session
  if (pathname.startsWith('/app')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // Company-level plan entitlement (featureFlags, from the Portal's
    // subscription plan) checked before the admin bypass below — this gates
    // by what the company's plan includes, not by staff permission, so even
    // an admin shouldn't reach a feature their plan doesn't include. One
    // real flag as proof of end-to-end wiring; extend this list only when a
    // second flag actually needs the same treatment.
    if (pathname.startsWith('/app/police-register') && session.user?.featureFlags?.policeRegister === false) {
      const dashboardUrl = new URL('/app/dashboard', req.url)
      dashboardUrl.searchParams.set('denied', '1')
      return NextResponse.redirect(dashboardUrl)
    }

    // Admins bypass all permission checks
    if (session.user?.role === 'admin') {
      // Still check force password change for admins
      if (session.user?.forcePasswordChange && pathname !== '/app/change-password') {
        return NextResponse.redirect(new URL('/app/change-password', req.url))
      }
      return next()
    }

    // Scale operators belong on the scale station, not the main app
    if (session.user?.role === 'scale_operator') {
      return NextResponse.redirect(new URL('/scale', req.url))
    }

    // Security guards belong at the gate, not the main app
    if (session.user?.role === 'security_guard') {
      return NextResponse.redirect(new URL('/gate', req.url))
    }

    // Force password change redirect
    if (session.user?.forcePasswordChange && pathname !== '/app/change-password') {
      return NextResponse.redirect(new URL('/app/change-password', req.url))
    }

    // Check module access permissions
    // Skip check if SKIP_MODULE_PERMISSIONS env var is set (emergency rollback)
    if (process.env.SKIP_MODULE_PERMISSIONS !== 'true') {
      const allowedModules = session.user?.allowedModules ?? []

      // Empty array = full access (backwards compatibility for existing users)
      if (allowedModules.length > 0) {
        const moduleKey = findModuleKey(pathname)

        // If we found a matching module and user doesn't have access, redirect
        if (moduleKey && !allowedModules.includes(moduleKey)) {
          // Redirect to dashboard with denied flag
          const dashboardUrl = new URL('/app/dashboard', req.url)
          dashboardUrl.searchParams.set('denied', '1')
          return NextResponse.redirect(dashboardUrl)
        }
      }
    }

    return next()
  }

  return next()
})

export const config = {
  matcher: ['/login', '/app/:path*', '/scale/:path*', '/gate/:path*', '/ledger/:path*', '/police/:path*', '/police', '/api/:path*'],
}
