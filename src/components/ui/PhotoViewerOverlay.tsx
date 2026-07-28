'use client'

// Fullscreen photo viewer using design tokens — completely unrestricted
// display, keyboard nav (Escape/arrows), body-scroll lock, thumbnail strip.
// Extracted from scale/admin/orders/page.tsx (was page-local, fully
// self-contained, zero coupling to that page) so it can be reused wherever
// a fullscreen photo viewer is needed.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { colors, fontSize, fontWeight, layout } from '@/lib/design-tokens'

export interface PhotoViewerOverlayProps {
  urls: string[]
  initialIndex: number
  onClose: () => void
}

export function PhotoViewerOverlay({ urls, initialIndex, onClose }: PhotoViewerOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [mounted, setMounted] = useState(false)

  // Wait for client-side mount before rendering portal
  useEffect(() => {
    setMounted(true)
  }, [])

  const goNext = useCallback(() => {
    if (urls.length > 1) {
      setCurrentIndex(prev => (prev + 1) % urls.length)
    }
  }, [urls.length])

  const goPrev = useCallback(() => {
    if (urls.length > 1) {
      setCurrentIndex(prev => (prev - 1 + urls.length) % urls.length)
    }
  }, [urls.length])

  // Keyboard navigation + body scroll lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          goNext()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          goPrev()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, goNext, goPrev])

  // Overlay container - covers entire viewport
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  // Close button style
  const closeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: layout.cardRadius,
    cursor: 'pointer',
    transition: 'background 150ms ease',
  }

  // Counter badge style
  const counterStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textOnDark,
  }

  // Navigation button style
  const navButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 56,
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'background 150ms ease',
  }

  // Image container - full viewport with minimal padding
  const imageContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  }

  // Image style - unrestricted, fills available space
  const imageStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: layout.cardRadius,
    userSelect: 'none',
  }

  // Thumbnail strip style
  const thumbnailStripStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: layout.cardRadius,
    maxWidth: '90vw',
    overflowX: 'auto',
  }

  // Thumbnail button style
  const thumbnailStyle = (isActive: boolean): React.CSSProperties => ({
    flexShrink: 0,
    width: 56,
    height: 56,
    borderRadius: layout.btnRadius,
    overflow: 'hidden',
    border: isActive ? `2px solid ${colors.action}` : '2px solid transparent',
    opacity: isActive ? 1 : 0.5,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    transform: isActive ? 'scale(1.1)' : 'scale(1)',
  })

  // Don't render on server - portal needs document.body
  if (!mounted) return null

  const overlayContent = (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={closeButtonStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
        aria-label="Close photo viewer"
      >
        <X style={{ width: 24, height: 24, color: colors.textOnDark }} />
      </button>

      {/* Photo counter */}
      <div style={counterStyle}>
        {currentIndex + 1} / {urls.length}
      </div>

      {/* Previous button */}
      {urls.length > 1 && (
        <button
          onClick={goPrev}
          style={{ ...navButtonStyle, left: 24 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
          aria-label="Previous photo"
        >
          <ChevronLeft style={{ width: 32, height: 32, color: colors.textOnDark }} />
        </button>
      )}

      {/* Main image */}
      <div style={imageContainerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[currentIndex]}
          alt={`Photo ${currentIndex + 1} of ${urls.length}`}
          style={imageStyle}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>

      {/* Next button */}
      {urls.length > 1 && (
        <button
          onClick={goNext}
          style={{ ...navButtonStyle, right: 24 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
          aria-label="Next photo"
        >
          <ChevronRight style={{ width: 32, height: 32, color: colors.textOnDark }} />
        </button>
      )}

      {/* Thumbnail strip */}
      {urls.length > 1 && (
        <div style={thumbnailStripStyle}>
          {urls.map((url, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              style={thumbnailStyle(i === currentIndex)}
              onMouseEnter={(e) => { if (i !== currentIndex) e.currentTarget.style.opacity = '0.8' }}
              onMouseLeave={(e) => { if (i !== currentIndex) e.currentTarget.style.opacity = '0.5' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Thumbnail ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Keyboard hint - desktop only */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          fontSize: fontSize.xs,
          color: 'rgba(255, 255, 255, 0.4)',
        }}
      >
        ESC to close{urls.length > 1 ? ' · Arrow keys to navigate' : ''}
      </div>
    </div>
  )

  // Render via portal to document.body - escapes all parent CSS stacking contexts
  return createPortal(overlayContent, document.body)
}
