import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { login } from '@/lib/services/authService'
import { LoginSchema } from '@/lib/schemas/auth'

export const { handlers, signIn, signOut, auth } = NextAuth({
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
          const { user, forcePasswordChange } = await login(
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
          }
        } catch {
          return null
        }
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: string }).role
        token.forcePasswordChange = (user as { forcePasswordChange: boolean }).forcePasswordChange
        token.fullName = (user as { fullName: string }).fullName
        token.username = (user as { username: string }).username
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      session.user.forcePasswordChange = token.forcePasswordChange as boolean
      session.user.fullName = token.fullName as string
      session.user.username = token.username as string
      return session
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12h default; cashier gets 8h (enforced via check)
  },

  pages: {
    signIn: '/login',
  },
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
    }
  }
}
