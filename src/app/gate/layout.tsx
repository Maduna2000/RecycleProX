import type { Viewport } from 'next'
import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
import GateClientLayout from './GateClientLayout'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function GateLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <SessionProvider session={session}>
      <GateClientLayout>
        {children}
      </GateClientLayout>
    </SessionProvider>
  )
}
