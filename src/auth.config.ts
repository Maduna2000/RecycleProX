/**
 * Edge-compatible auth config — no Prisma, no bcrypt, no Node.js-only modules.
 * Used by middleware.ts which runs in the Edge Runtime.
 *
 * The full auth.ts (with Credentials provider + Prisma) is only imported in
 * API routes and server components that run in the Node.js runtime.
 */
import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  providers: [],   // Credentials provider is added in auth.ts (Node runtime only)

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id                  = user.id as string
        token.role                = (user as { role: string }).role
        token.forcePasswordChange = (user as { forcePasswordChange: boolean }).forcePasswordChange
        token.fullName            = (user as { fullName: string }).fullName
        token.username            = (user as { username: string }).username
      }
      return token
    },
    session({ session, token }) {
      session.user.id                  = token.id as string
      session.user.role                = token.role as string
      session.user.forcePasswordChange = token.forcePasswordChange as boolean
      session.user.fullName            = token.fullName as string
      session.user.username            = token.username as string
      return session
    },
    authorized({ auth }) {
      // Used by middleware — just check that a session exists
      return !!auth?.user
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60,
  },

  pages: {
    signIn: '/login',
  },
}
