import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
import ScaleClientLayout from './ScaleClientLayout'

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
