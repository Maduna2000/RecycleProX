import NextAuth, { type Session } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { decode } from '@auth/core/jwt'
import { headers } from 'next/headers'
import { login, InvalidCredentialsError, AccountInactiveError, AccountLockedError } from '@/lib/services/authService'
import { cacheOfflineLogin, tryOfflineLogin } from '@/lib/services/offlineAuthCache'
import { LoginSchema } from '@/lib/schemas/auth'
import { authConfig } from '@/auth.config'
import logger from '@/lib/logger'

// Set only on a licensed Electron desktop install — electron/main.js reads
// the company this device was activated for (electron/licenseManager.js's
// stored companySlug, populated by the Portal's /api/desktop/activate
// response) and injects it into the standalone server's process env at
// spawn time. Never set on Vercel/Web (genuinely multi-tenant, any company
// may log in there) or on the local hardware-bridge server (scripts/
// local-server/ — deliberately has no per-device license at all, see its
// own README's "No separate device license" note).
//
// Without this check, a device's subscription/seat is billed per company
// but nothing stops a DIFFERENT company's valid credentials from logging
// into it — once more than one real tenant exists, that silently defeats
// the entire per-device licensing model. undefined licensedTenantSlug (no
// device lock configured) always passes — this is purely additive to
// existing single-tenant deployments.
function isLicensedTenantMismatch(loginTenantSlug: string | undefined): boolean {
  const licensedTenantSlug = process.env.LICENSED_TENANT_SLUG
  if (!licensedTenantSlug) return false
  return loginTenantSlug !== licensedTenantSlug
}

const {
  handlers,
  signIn,
  signOut,
  auth: nextAuthCore,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        // Resolved from the login subdomain by middleware.ts and threaded
        // through by src/app/login/page.tsx + LoginForm.tsx. Absent (undefined)
        // for the default/legacy tenant's own domain — that keeps login on
        // the single public-schema tenant exactly as before subdomain
        // routing existed.
        tenantSlug: { label: 'Tenant', type: 'text' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null
        const { username, password, tenantSlug } = parsed.data

        try {
          const result = await login(username, password, tenantSlug)
          const resolvedTenantSlug = 'tenantSlug' in result ? result.tenantSlug : undefined
          if (isLicensedTenantMismatch(resolvedTenantSlug)) {
            logger.warn(
              { username, resolvedTenantSlug, licensedTenantSlug: process.env.LICENSED_TENANT_SLUG },
              'authorize() rejected: login tenant does not match this device\'s licensed company',
            )
            return null
          }
          const { user, forcePasswordChange, allowedModules } = result
          const payload = {
            id: user.id,
            role: user.role,
            forcePasswordChange,
            fullName: user.fullName,
            username: user.username,
            allowedModules,
            tenantId: 'tenantId' in result ? result.tenantId : undefined,
            schemaName: 'schemaName' in result ? result.schemaName : undefined,
            tenantSlug: resolvedTenantSlug,
            featureFlags: 'featureFlags' in result ? result.featureFlags : undefined,
          }
          // Refresh this device's offline login fallback on every successful
          // online auth (see offlineAuthCache.ts) — best-effort, never blocks
          // the real login that triggered it.
          void cacheOfflineLogin(username, password, tenantSlug, payload)
          return { ...payload, name: user.fullName, email: user.username }
        } catch (err) {
          if (err instanceof InvalidCredentialsError || err instanceof AccountInactiveError || err instanceof AccountLockedError) {
            // The database was reachable and it said no — a genuine
            // rejection, not a connectivity problem. Never fall through to
            // the offline cache here; that would let a stale/offline device
            // silently overrule an authoritative "wrong password"/"locked".
            logger.warn({ err, username }, 'authorize() rejected credentials')
            return null
          }

          // Anything else here (Prisma connection refused, DNS failure,
          // timeout, tenant registry unreachable, ...) means the database
          // itself couldn't be reached — the exact scenario an offline-first
          // desktop app needs to survive. Fall back to the last known-good
          // credentials cached locally from this user's last successful
          // online login on this machine, rather than locking the till out
          // of the app entirely the moment its internet drops.
          logger.warn({ err, username }, 'authorize(): database unreachable, trying offline login fallback')
          const offline = await tryOfflineLogin(username, password, tenantSlug)
          if (!offline) return null
          // A cache entry written before tenantId was part of this payload
          // (an older install, or any future field this shape gains) would
          // otherwise mint a session that looks valid but has no tenantId —
          // every tenant-scoped query then 500s for this token's whole 12h
          // lifetime with nothing to notice or self-correct, since there's
          // no online round-trip here to catch it. Reject it outright
          // instead: the cashier gets a clear "log in once online" failure
          // now, rather than a silently broken session later.
          if (!offline.tenantId) {
            logger.error({ username }, 'authorize(): offline login cache entry missing tenantId — rejecting, needs a fresh online login')
            return null
          }
          // Belt-and-suspenders: cacheOfflineLogin only ever persists an
          // entry after this same check already passed online (see above),
          // so this should never actually trip — kept anyway in case a
          // device's LICENSED_TENANT_SLUG changes (reactivated for a
          // different company) while an old cache entry for the previous
          // company still sits on disk.
          if (isLicensedTenantMismatch(offline.tenantSlug)) {
            logger.warn(
              { username, cachedTenantSlug: offline.tenantSlug, licensedTenantSlug: process.env.LICENSED_TENANT_SLUG },
              'authorize() rejected offline login: cached tenant does not match this device\'s licensed company',
            )
            return null
          }
          logger.info({ username }, 'authorize(): offline login accepted')
          return { ...offline, name: offline.fullName, email: offline.username }
        }
      },
    }),
  ],
})

export { handlers, signIn, signOut }

// Same salt-derivation rule as middleware.ts/api/mobile/session's identical
// function — must match whatever @auth/core would compute from the
// request's own protocol, not NODE_ENV (see that file's comment for why).
// headers() has no direct access to the request URL, so this reads the
// x-forwarded-proto Vercel's edge proxy sets instead — every real
// deployment (production or preview) is HTTPS, so this is inert almost
// everywhere except genuine local HTTP dev.
function mobileSessionSalt(h: Headers): string {
  return h.get('x-forwarded-proto') === 'http' ? 'authjs.session-token' : '__Secure-authjs.session-token'
}

// Bearer-token fallback for mobile clients (Guard Station, Scale Station),
// which authenticate via Authorization header rather than a browser cookie
// jar — mirrors middleware.ts's identical resolveMobileSession(). Every API
// route handler calls this exported auth() directly (a second, independent
// NextAuth invocation from middleware.ts's own auth() wrapper) — patching
// only middleware.ts left every route handler still cookie-only, so a
// mobile request could pass middleware's gate and still 401 here.
async function resolveMobileSession(): Promise<Session | null> {
  const h = await headers()
  const authHeader = h.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  try {
    const decoded = await decode({ token, secret: process.env.AUTH_SECRET!, salt: mobileSessionSalt(h) })
    if (!decoded?.id || typeof decoded.id !== 'string') return null
    return {
      user: {
        id: decoded.id,
        name: (decoded.name as string | null) ?? null,
        email: (decoded.email as string | null) ?? null,
        role: (decoded.role as string) ?? '',
        forcePasswordChange: (decoded.forcePasswordChange as boolean) ?? false,
        fullName: (decoded.fullName as string) ?? '',
        username: (decoded.username as string) ?? '',
        allowedModules: (decoded.allowedModules as string[]) ?? [],
        tenantId: (decoded.tenantId as string | undefined) ?? undefined,
        schemaName: (decoded.schemaName as string | undefined) ?? undefined,
        tenantSlug: (decoded.tenantSlug as string | undefined) ?? undefined,
        featureFlags: (decoded.featureFlags as Record<string, boolean> | undefined) ?? undefined,
      },
      expires: new Date(((decoded.exp as number) ?? 0) * 1000).toISOString(),
    }
  } catch {
    return null
  }
}

// Deliberately typed as the plain no-arg overload rather than
// `typeof nextAuthCore` — NextAuth's `auth` export is overloaded (bare call,
// route-handler wrapper, middleware wrapper) and `Parameters<>`/generic
// forwarding collapses that union to the wrong branch. This codebase only
// ever calls `auth()` with zero arguments, so that's the only signature
// exposed here.
//
// tenantId reaches downstream prisma.ts calls via the x-tenant-id request
// header (set by middleware.ts from this same session, read back out by
// requireTenantId() in src/lib/db/tenantContext.ts via next/headers) — NOT
// via tenantContext.enterWith() here. That was the original design and
// does NOT work: an async function's enterWith() call only affects code
// running inside that same function's own continuation — code that
// awaited auth() (every caller, everywhere) resumes in the context that
// was active before the call, not whatever this function mutated
// internally. Confirmed via a live production incident — see
// i-need-you-to-vectorized-pumpkin.md Section 11.
export async function auth(): Promise<Session | null> {
  return (await nextAuthCore()) ?? (await resolveMobileSession())
}

// Extend next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: string
      forcePasswordChange: boolean
      fullName: string
      username: string
      allowedModules: string[]
      tenantId?: string
      schemaName?: string
      tenantSlug?: string
      featureFlags?: Record<string, boolean>
    }
  }
}
