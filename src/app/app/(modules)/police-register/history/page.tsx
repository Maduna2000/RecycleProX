'use client'

import { useSession } from 'next-auth/react'
import { colors } from '@/lib/design-tokens'
import { PortalPage } from '@/components/rpx'
import { VisitHistoryTab } from '../PoliceRegisterTabs'

export default function PoliceVisitHistoryPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  if (!isManager) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, fontSize: 13, color: colors.textSecondary }}>
        Access restricted to managers and administrators.
      </div>
    )
  }

  return (
    <PortalPage maxWidth={960}>
      <VisitHistoryTab />
    </PortalPage>
  )
}
