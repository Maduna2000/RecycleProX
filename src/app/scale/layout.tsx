import type { Viewport } from 'next'
import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
import ScaleClientLayout from './ScaleClientLayout'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function ScaleLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <SessionProvider session={session}>
      <ScaleClientLayout>
        {children}
      </ScaleClientLayout>
    </SessionProvider>
  )
}
