import type { Viewport } from 'next'
import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from '@/components/ui/sonner'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function PoliceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <SessionProvider session={session}>
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F1F3F4' }}>
        {children}
      </div>
      <Toaster richColors />
    </SessionProvider>
  )
}
