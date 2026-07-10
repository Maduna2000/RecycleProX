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
        // Resolved from the login subdomain once tenant routing goes live —
        // absent today, so every sign-in stays on the single default tenant.
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
            schemaName: 'schemaName' in result ? result.schemaName : undefined,
            tenantSlug: 'tenantSlug' in result ? result.tenantSlug : undefined,
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
  const schemaName = session?.user?.schemaName
  const tenantSlug = session?.user?.tenantSlug
  if (schemaName && tenantSlug) {
    tenantContext.enterWith({ schemaName, companySlug: tenantSlug })
  }
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
      schemaName?: string
      tenantSlug?: string
    }
  }
}
