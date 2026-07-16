/**
 * Edge-compatible middleware — uses authConfig only (no Prisma, no bcrypt).
 * Route protection and redirect logic only — no DB calls.
 */
import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const { auth } = NextAuth(authConfig)

// Module keys that can be controlled via permissions
const MODULE_KEYS = [
  '/app/dashboard',
  '/app/customers',
  '/app/purchases',
  '/app/sales',
  '/app/payments',
  '/app/expenses',
  '/app/cashup',
  '/app/float',
  '/app/stock',
  '/app/stocktake',
  '/app/products',
  '/app/price-groups',
  '/app/reports',
  '/app/police-register',
  '/app/audit-log',
  '/app/settings',
]

/**
 * Find the module key for a given pathname.
 * e.g., /app/purchases/new → /app/purchases
 */
function findModuleKey(pathname: string): string | null {
  // Exact match
  if (MODULE_KEYS.includes(pathname)) return pathname

  // Prefix match (e.g., /app/purchases/new → /app/purchases)
  return MODULE_KEYS.find((key) => pathname.startsWith(key + '/')) ?? null
}

type SessionUser = {
  role?: string
  forcePasswordChange?: boolean
  allowedModules?: string[]
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

export default auth((req: NextRequest & { auth: { user?: SessionUser } | null }) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Dev-only override so subdomain-based tenant login is testable on
  // localhost without wildcard DNS: ?tenant=<slug> on the /login page.
  // Never honored in production — real tenant resolution there is always
  // derived from the actual hostname below.
  const devTenantOverride =
    process.env.NODE_ENV !== 'production' ? req.nextUrl.searchParams.get('tenant') : null
  const tenantSlug = devTenantOverride ?? deriveTenantSlugFromHost(req.nextUrl.hostname)

  // Public routes — always allow. /api/internal/ is shared-secret
  // authenticated in its own route handlers (server-to-server calls from
  // the SaaS Portal never carry a session cookie) — see
  // src/app/api/internal/tenants/route.ts. /api/sync/ is device-token
  // authenticated the same way — Desktop's background sync process has no
  // interactive login — see src/lib/services/deviceAuthClient.ts.
  if (pathname.startsWith('/login') ||
      pathname === '/api/r2/test' || pathname === '/scale/login' ||
      pathname.startsWith('/api/mobile/') || pathname.startsWith('/api/internal/') ||
      pathname.startsWith('/api/sync/')) {
    if (pathname.startsWith('/login') && tenantSlug) {
      const headers = new Headers(req.headers)
      headers.set('x-tenant-slug', tenantSlug)
      return NextResponse.next({ request: { headers } })
    }
    return NextResponse.next()
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

  // Police officer portal — staff-launched; any staff role except scale operators
  if (pathname.startsWith('/police')) {
    if (!session) return NextResponse.redirect(new URL('/login', req.url))
    if (session.user?.role === 'scale_operator') {
      return NextResponse.redirect(new URL('/scale', req.url))
    }
    return NextResponse.next()
  }

  // API routes — 401 if no session (individual routes do full role checks)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Scale station operator routes — restricted to scale_operator + admin + manager
  if (pathname.startsWith('/scale') && !pathname.startsWith('/scale/admin')) {
    if (!session) return NextResponse.redirect(new URL('/scale/login', req.url))
    const role = session.user?.role
    if (!['scale_operator', 'admin', 'manager'].includes(role ?? '')) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // Scale admin routes — admin + manager only
  if (pathname.startsWith('/scale/admin')) {
    if (!session) return NextResponse.redirect(new URL('/login', req.url))
    const role = session.user?.role
    if (!['admin', 'manager'].includes(role ?? '')) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return NextResponse.next()
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
      return NextResponse.next()
    }

    // Scale operators belong on the scale station, not the main app
    if (session.user?.role === 'scale_operator') {
      return NextResponse.redirect(new URL('/scale', req.url))
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

    return NextResponse.next()
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/login', '/app/:path*', '/scale/:path*', '/police/:path*', '/police', '/api/:path*'],
}
