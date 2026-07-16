import NextAuth, { type Session } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { login } from '@/lib/services/authService'
import { LoginSchema } from '@/lib/schemas/auth'
import { authConfig } from '@/auth.config'
import { tenantContext } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

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

        try {
          const result = await login(
            parsed.data.username,
            parsed.data.password,
            parsed.data.tenantSlug,
          )
          const { user, forcePasswordChange, allowedModules } = result
          return {
            id: user.id,
            name: user.fullName,
            email: user.username,
            role: user.role,
            forcePasswordChange,
            fullName: user.fullName,
            username: user.username,
            allowedModules,
            tenantId: 'tenantId' in result ? result.tenantId : undefined,
            schemaName: 'schemaName' in result ? result.schemaName : undefined,
            tenantSlug: 'tenantSlug' in result ? result.tenantSlug : undefined,
            featureFlags: 'featureFlags' in result ? result.featureFlags : undefined,
          }
        } catch (err) {
          // Log the real error so it shows in Vercel function logs
          logger.error({ err }, 'authorize() failed')
          return null
        }
      },
    }),
  ],
})

export { handlers, signIn, signOut }

// Wraps NextAuth's session resolution to populate tenantContext for the rest
// of the current request as a side effect — every API route/service already
// starts with `const session = await auth()` (the only call pattern used
// anywhere in this codebase), so this is the one place that needs to change
// for the ~50 files calling `prisma` downstream to resolve the right tenant
// schema. No-ops (same as before) when the session carries no schemaName
// claim, which is always true until subdomain login exists.
//
// Deliberately typed as the plain no-arg overload rather than
// `typeof nextAuthCore` — NextAuth's `auth` export is overloaded (bare call,
// route-handler wrapper, middleware wrapper) and `Parameters<>`/generic
// forwarding collapses that union to the wrong branch. This codebase only
// ever calls `auth()` with zero arguments, so that's the only signature
// exposed here.
export async function auth(): Promise<Session | null> {
  const session = await nextAuthCore()
  const tenantId = session?.user?.tenantId
  const schemaName = session?.user?.schemaName
  const tenantSlug = session?.user?.tenantSlug
  if (tenantId && schemaName && tenantSlug) {
    tenantContext.enterWith({ tenantId, schemaName, companySlug: tenantSlug })
  }
  // TEMPORARY diagnostic — live incident, see i-need-you-to-vectorized-pumpkin.md
  // Section 11. Remove once the MissingTenantContextError root cause is found.
  logger.warn(
    {
      hasSession: !!session,
      tenantId, schemaName, tenantSlug,
      storeAfterEnterWith: tenantContext.getStore(),
    },
    'auth-diagnostic',
  )
  return session
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
