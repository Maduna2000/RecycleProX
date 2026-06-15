import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { login } from '@/lib/services/authService'
import { LoginSchema } from '@/lib/schemas/auth'
import { authConfig } from '@/auth.config'
import logger from '@/lib/logger'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null

        try {
          const { user, forcePasswordChange, allowedModules } = await login(
            parsed.data.username,
            parsed.data.password,
          )
          return {
            id: user.id,
            name: user.fullName,
            email: user.username,
            role: user.role,
            forcePasswordChange,
            fullName: user.fullName,
            username: user.username,
            allowedModules,
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
    }
  }
}
