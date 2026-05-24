'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getModuleName, getModuleIcon } from '@/lib/module-names'
import { useWindowStore } from '@/stores/windowStore'
import { PageTitleBar } from '@/components/ui/PageTitleBar'

export function WindowedContent({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname()
  const { openWindow } = useWindowStore()

  useEffect(() => {
    if (pathname === '/app/dashboard') return
    openWindow(pathname, getModuleName(pathname), getModuleIcon(pathname))
    // openWindow is a stable Zustand action — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageTitleBar />
      {children}
    </div>
  )
}
