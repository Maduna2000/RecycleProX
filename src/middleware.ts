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
}

export default auth((req: NextRequest & { auth: { user?: SessionUser } | null }) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Public routes — always allow
  if (pathname.startsWith('/login') || pathname.startsWith('/police') ||
      pathname === '/api/r2/test' || pathname === '/scale/login' ||
      pathname.startsWith('/api/mobile/')) {
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
  matcher: ['/app/:path*', '/scale/:path*', '/api/:path*'],
}
