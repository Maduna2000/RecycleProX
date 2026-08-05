'use client'

import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

/**
 * OS-level window controls (minimize / maximize-restore / close) for the
 * Electron desktop build. main.js sets frame:false + titleBarStyle:'hidden'
 * on every window, which removes native chrome entirely in favor of a
 * custom title bar — this is that title bar's button row. Renders nothing
 * on the Vercel web app, where window.electronAPI is undefined.
 *
 * Every button (and this component's own root) must carry
 * -webkit-app-region: no-drag — it sits inside a header that has
 * app-region: drag applied, and without the override the drag region
 * would swallow the clicks.
 */
export function WindowControls() {
  const [isElectron, setIsElectron] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.isElectron) return
    setIsElectron(true)
    return window.electronAPI.onWindowStateChange(setIsMaximized)
  }, [])

  if (!isElectron) return null

  return (
    <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => window.electronAPI?.minimize()}
        title="Minimise"
        aria-label="Minimise window"
        className="w-8 h-7 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => window.electronAPI?.maximize()}
        title={isMaximized ? 'Restore' : 'Maximise'}
        aria-label={isMaximized ? 'Restore window' : 'Maximise window'}
        className="w-8 h-7 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
      </button>
      <button
        onClick={() => window.electronAPI?.close()}
        title="Close"
        aria-label="Close window"
        className="w-8 h-7 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-red-600 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
