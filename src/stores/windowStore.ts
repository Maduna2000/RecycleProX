import { create } from 'zustand'
import type { LucideIcon } from 'lucide-react'

export interface WindowEntry {
  id:    string
  href:  string
  label: string
  icon:  LucideIcon
}

interface WindowStore {
  windows: WindowEntry[]
  openWindow(href: string, label: string, icon: LucideIcon): void
  updateWindowLabel(href: string, label: string): void
  closeWindow(id: string, navigate: (href: string) => void): void
  clearAll(): void
}

export const useWindowStore = create<WindowStore>()((set, get) => ({
  windows: [],

  openWindow(href, label, icon) {
    const { windows } = get()
    if (windows.some(w => w.href === href)) return
    const entry: WindowEntry = { id: crypto.randomUUID(), href, label, icon }
    const next = windows.length >= 4
      ? [...windows.slice(1), entry]
      : [...windows, entry]
    set({ windows: next })
  },

  updateWindowLabel(href, label) {
    const { windows } = get()
    const idx = windows.findIndex(w => w.href === href)
    if (idx === -1) return
    const existing = windows[idx]
    if (!existing) return
    const next = [...windows]
    next[idx] = { ...existing, label }
    set({ windows: next })
  },

  closeWindow(id, navigate) {
    const { windows } = get()
    const idx = windows.findIndex(w => w.id === id)
    if (idx === -1) return
    const next = windows.filter(w => w.id !== id)
    set({ windows: next })
    if (next.length === 0) {
      navigate('/app/dashboard')
    } else {
      const target = next[Math.max(0, idx - 1)]
      navigate(target?.href ?? '/app/dashboard')
    }
  },

  clearAll() {
    set({ windows: [] })
  },
}))
