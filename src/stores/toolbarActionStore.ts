import { create } from 'zustand'
import { useEffect } from 'react'

interface ToolbarActionOverride {
  enabled: boolean
  onClick: () => void
}

interface ToolbarActionState {
  overrides: Record<string, ToolbarActionOverride>
  register: (id: string, override: ToolbarActionOverride) => void
  unregister: (id: string) => void
}

export const useToolbarActionStore = create<ToolbarActionState>()((set) => ({
  overrides: {},
  register: (id, override) => set((s) => ({ overrides: { ...s.overrides, [id]: override } })),
  unregister: (id) => set((s) => {
    const next = { ...s.overrides }
    delete next[id]
    return { overrides: next }
  }),
}))

/**
 * A mounted page calls this to make one of toolbarActions.ts's dynamic
 * (no-`href`) entries actually clickable — e.g. Expenses' detail page only
 * enables "Approve" while viewing a pending expense. Auto-unregisters on
 * unmount or when `enabled`/`onClick` change, so navigating away always
 * leaves the button back in its default (registry-driven, disabled) state
 * rather than stuck enabled for whatever page last set it.
 */
export function useToolbarAction(id: string, override: ToolbarActionOverride) {
  const register = useToolbarActionStore((s) => s.register)
  const unregister = useToolbarActionStore((s) => s.unregister)

  useEffect(() => {
    register(id, override)
    return () => unregister(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, override.enabled, override.onClick])
}
