'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getModuleName, getModuleIcon } from '@/lib/module-names'
import { useWindowStore } from '@/stores/windowStore'
import { FloatingWindowFrame } from '@/components/layout/FloatingWindowFrame'
import { useRecordTitle } from '@/hooks/useRecordTitle'
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog'

export function WindowedContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { openWindow, updateWindowLabel } = useWindowStore()
  const { title: recordTitle, isDetailPage, isLoading } = useRecordTitle(pathname)

  // Register window when pathname changes
  useEffect(() => {
    if (pathname === '/app/dashboard') return
    openWindow(pathname, getModuleName(pathname), getModuleIcon(pathname))
    // openWindow is a stable Zustand action — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Update window label when record title loads (for detail pages)
  useEffect(() => {
    if (isDetailPage && recordTitle && !isLoading) {
      updateWindowLabel(pathname, recordTitle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, recordTitle, isDetailPage, isLoading])

  return (
    <ConfirmDialogProvider>
      <FloatingWindowFrame title={isDetailPage ? recordTitle : undefined}>
        {children}
      </FloatingWindowFrame>
    </ConfirmDialogProvider>
  )
}
