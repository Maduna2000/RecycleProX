'use client'

/**
 * Wraps PageTitleBar + a page's own content as one movable, resizable,
 * maximizable window — the MT4-style "floating page" feature. Position/size
 * live in windowGeometryStore, keyed by module identity and persisted, so a
 * page remembers where you left it. No stored geometry (the default, and
 * the only state on a small viewport) renders exactly as before this
 * feature existed: full-size within Zone 3, no drag, no resize.
 *
 * Owns all the drag/resize math; PageTitleBar stays focused on rendering
 * and minimize/close, taking a maximize-toggle + a drag-start callback as
 * props from here.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { getModuleKey } from '@/lib/module-names'
import { getPageWidthCap } from '@/lib/pageWidthCaps'
import { useWindowGeometryStore } from '@/stores/windowGeometryStore'
import { PageTitleBar } from '@/components/ui/PageTitleBar'

const MIN_WIDTH = 560
const MIN_HEIGHT = 360
/** Below this viewport width, floating windows would just be awkward and
 * easy to lose (a narrow browser window or a tablet in portrait) — force
 * maximized-only and ignore any saved geometry until it widens again. */
const SMALL_VIEWPORT_BREAKPOINT = 960

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Rect = { x: number; y: number; width: number; height: number }

function useSmallViewport(): boolean {
  const [small, setSmall] = useState(false)
  useEffect(() => {
    function check() { setSmall(window.innerWidth < SMALL_VIEWPORT_BREAKPOINT) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return small
}

export function FloatingWindowFrame({ title, children }: { title?: string | null; children: React.ReactNode }) {
  const pathname = usePathname()
  const moduleKey = getModuleKey(pathname)
  const widthCap = getPageWidthCap(pathname)

  const containerRef = useRef<HTMLDivElement>(null)
  const stored = useWindowGeometryStore((s) => s.geometries[moduleKey])
  const setFloatingGeometry = useWindowGeometryStore((s) => s.setFloatingGeometry)
  const toggleMaximized = useWindowGeometryStore((s) => s.toggleMaximized)

  // Live drag/resize preview — separate from the persisted store so a
  // gesture updates at render speed instead of writing to localStorage on
  // every pixel of movement. Committed to the store on mouseup.
  const [live, setLive] = useState<Rect | null>(null)
  const isSmallViewport = useSmallViewport()

  const isMaximized = isSmallViewport || !stored || stored.maximized

  const parentBounds = useCallback((): DOMRect | null => {
    return containerRef.current?.parentElement?.getBoundingClientRect() ?? null
  }, [])

  // The starting rect for a gesture that begins from the maximized state —
  // there's nothing to "restore" to yet, so it starts at the page's
  // registered default width (pageWidthCaps) or the full content area,
  // filling the height, positioned at the origin.
  function defaultFloatingRect(): Rect {
    const bounds = parentBounds()
    return {
      x: 0,
      y: 0,
      width: widthCap ?? bounds?.width ?? MIN_WIDTH,
      height: bounds?.height ?? MIN_HEIGHT,
    }
  }

  function clampToBounds(rect: Rect, bounds: DOMRect): Rect {
    const width = Math.min(rect.width, bounds.width)
    const height = Math.min(rect.height, bounds.height)
    // The title bar (top edge, ~34px tall) must always stay grabbable —
    // clamp so at least 80px of it stays within the visible bounds on
    // every side rather than letting the whole window drift off-screen.
    const x = Math.min(Math.max(rect.x, -width + 80), bounds.width - 80)
    const y = Math.min(Math.max(rect.y, 0), bounds.height - 34)
    return { x, y, width, height }
  }

  function handleTitleBarMouseDown(e: React.MouseEvent) {
    if (isSmallViewport) return
    const bounds = parentBounds()
    if (!bounds) return

    const base = !isMaximized && stored ? stored : defaultFloatingRect()
    const start = { clientX: e.clientX, clientY: e.clientY, ...base }

    function onMove(ev: MouseEvent) {
      const b = parentBounds()
      if (!b) return
      const dx = ev.clientX - start.clientX
      const dy = ev.clientY - start.clientY
      setLive(clampToBounds({ x: start.x + dx, y: start.y + dy, width: start.width, height: start.height }, b))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setLive((current) => {
        if (current) setFloatingGeometry(moduleKey, current)
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleResizeMouseDown(edge: Edge) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isSmallViewport) return
      const base = !isMaximized && stored ? stored : defaultFloatingRect()
      const start = { clientX: e.clientX, clientY: e.clientY, ...base }

      function onMove(ev: MouseEvent) {
        const bounds = parentBounds()
        if (!bounds) return
        const dx = ev.clientX - start.clientX
        const dy = ev.clientY - start.clientY

        let { x, y, width, height } = start
        if (edge.includes('e')) width = Math.max(MIN_WIDTH, start.width + dx)
        if (edge.includes('s')) height = Math.max(MIN_HEIGHT, start.height + dy)
        if (edge.includes('w')) {
          width = Math.max(MIN_WIDTH, start.width - dx)
          x = start.x + (start.width - width)
        }
        if (edge.includes('n')) {
          height = Math.max(MIN_HEIGHT, start.height - dy)
          y = start.y + (start.height - height)
        }
        setLive(clampToBounds({ x, y, width, height }, bounds))
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setLive((current) => {
          if (current) setFloatingGeometry(moduleKey, current)
          return null
        })
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
  }

  const showFloating = !!live || (!isMaximized && !!stored)
  const rect: Rect | null = live ?? (stored && !stored.maximized ? stored : null)

  const containerStyle: React.CSSProperties = showFloating && rect
    ? {
        position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        display: 'flex', flexDirection: 'column',
        boxShadow: '4px 4px 16px rgba(0,0,0,0.25)',
      }
    : {
        // Maximized/default state. A page registered in pageWidthCaps.ts
        // caps and centers here too — matching its own PortalPage content,
        // which independently caps to the same width via ordinary CSS
        // max-width — instead of stretching the title bar to full Zone 3
        // width while the content beneath stays capped, which is the
        // "title bar wider than the page" bug this fixes. Uncapped pages
        // still fill 100%, unchanged.
        position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
        ...(widthCap
          ? { width: '100%', maxWidth: widthCap, margin: '0 auto' }
          : { width: '100%' }),
      }

  return (
    <div ref={containerRef} style={containerStyle}>
      <PageTitleBar
        title={title}
        isMaximized={!showFloating}
        onMaximizeToggle={isSmallViewport ? undefined : () => toggleMaximized(moduleKey)}
        onTitleBarMouseDown={isSmallViewport ? undefined : handleTitleBarMouseDown}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>

      {!isSmallViewport && showFloating && (
        // Insets (not negative offsets straddling the border) — a window
        // often sits flush against Zone 3's own edge (e.g. y:0 right after
        // un-maximizing), and Zone 3 clips with overflow-hidden, so a
        // handle poking outside the window's own box would be partly
        // unusable exactly in that common case.
        <>
          <div onMouseDown={handleResizeMouseDown('n')}  style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
          <div onMouseDown={handleResizeMouseDown('s')}  style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
          <div onMouseDown={handleResizeMouseDown('w')}  style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }} />
          <div onMouseDown={handleResizeMouseDown('e')}  style={{ position: 'absolute', right: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }} />
          <div onMouseDown={handleResizeMouseDown('nw')} style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
          <div onMouseDown={handleResizeMouseDown('se')} style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
          <div onMouseDown={handleResizeMouseDown('ne')} style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
          <div onMouseDown={handleResizeMouseDown('sw')} style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
        </>
      )}
    </div>
  )
}
