import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTitleBarActionsStore } from '@/stores/titleBarActionsStore'

/**
 * Registers page-specific controls into the shared windowed PageTitleBar
 * for as long as the calling component is mounted, clearing them again on
 * unmount (or when `actions` changes) so they never linger into whatever
 * page is opened next.
 */
export function useTitleBarActions(actions: ReactNode | null) {
  const setActions = useTitleBarActionsStore((s) => s.setActions)

  useEffect(() => {
    setActions(actions)
    return () => setActions(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions])
}
