import type { Metadata, Viewport } from 'next'
import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
import GateClientLayout from './GateClientLayout'

export const metadata: Metadata = {
  title: 'Gate Security',
  manifest: '/manifest-gate.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Gate Security',
  },
  icons: {
    icon: '/icons/gate-icon-192.png',
    apple: '/icons/gate-icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0F203A',
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
