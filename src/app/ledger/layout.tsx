import type { Metadata, Viewport } from 'next'
import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
import LedgerClientLayout from './LedgerClientLayout'

export const metadata: Metadata = {
  title: 'Ledger — Renovo Pro',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#003399',
}

export default async function LedgerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <SessionProvider session={session}>
      <LedgerClientLayout>
        {children}
      </LedgerClientLayout>
    </SessionProvider>
  )
}
