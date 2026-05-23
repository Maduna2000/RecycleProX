import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function ScaleAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    redirect('/login')
  }
  return <>{children}</>
}
