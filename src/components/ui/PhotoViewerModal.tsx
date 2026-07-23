'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Btn, BAR_GRAD } from '@/components/rpx'

export interface PhotoViewerPhoto {
  label: string
  url:   string
}

interface Props {
  title:    string
  subtitle?: string
  photos:   PhotoViewerPhoto[]
  onClose:  () => void
}

/**
 * Shared captured-photo viewer — a grid of photos with click-to-expand
 * full-screen carousel (Escape/arrow-key navigation, prev/next buttons).
 * Used by both the Guard Station and Scale Station admin pages to view
 * photos captured during a gate entry or a scale weigh-in order.
 */
export function PhotoViewerModal({ title, subtitle, photos, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (expandedIndex !== null) setExpandedIndex(null)
        else onClose()
      } else if (expandedIndex !== null && photos.length > 1) {
        if (e.key === 'ArrowLeft')  setExpandedIndex((expandedIndex - 1 + photos.length) % photos.length)
        if (e.key === 'ArrowRight') setExpandedIndex((expandedIndex + 1) % photos.length)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [expandedIndex, onClose, photos.length])

  if (!mounted) return null

  const modalContent = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: colors.surface, border: '1px solid #B0B0B0', borderRadius: 4, width: '100%', maxWidth: 900, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, padding: '0 8px 0 14px', borderBottom: '2px solid #B0B0B0', background: BAR_GRAD }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Images style={{ width: 14, height: 14, color: colors.primary }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary }}>{title}</span>
            {subtitle && <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{subtitle}</span>}
          </div>
          <button
            onClick={onClose}
            style={{ width: 24, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 2, cursor: 'pointer', color: colors.textSecondary }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.danger; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textSecondary }}
            aria-label="Close"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: colors.bg }}>
          {photos.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, color: colors.textSecondary }}>
              <Images style={{ width: 48, height: 48, opacity: 0.3, marginBottom: 12 }} />
              <span style={{ fontSize: fontSize.sm }}>No photos captured</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: photos.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {photos.map((p, i) => (
                <div key={i} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, background: colors.toolbar }}>
                    <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{p.label}</span>
                    {photos.length > 1 && <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{i + 1} of {photos.length}</span>}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.label}
                    style={{ width: '100%', height: 260, objectFit: 'contain', display: 'block', background: colors.bg, cursor: 'zoom-in' }}
                    onClick={() => setExpandedIndex(i)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colors.surface }}>
          <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            {photos.length} photo{photos.length !== 1 ? 's' : ''}{photos.length > 0 ? ' · Click to expand' : ''}
          </span>
          <Btn size="sm" onClick={onClose}>Close</Btn>
        </div>
      </div>

      {expandedIndex !== null && photos[expandedIndex] && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setExpandedIndex(null)}
        >
          <button
            onClick={() => setExpandedIndex(null)}
            style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 2, cursor: 'pointer' }}
          >
            <X style={{ width: 20, height: 20, color: '#fff' }} />
          </button>

          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedIndex((expandedIndex - 1 + photos.length) % photos.length) }}
                style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 2, cursor: 'pointer' }}
              >
                <ChevronLeft style={{ width: 24, height: 24, color: '#fff' }} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedIndex((expandedIndex + 1) % photos.length) }}
                style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 2, cursor: 'pointer' }}
              >
                <ChevronRight style={{ width: 24, height: 24, color: '#fff' }} />
              </button>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[expandedIndex]!.url}
              alt={photos[expandedIndex]!.label}
              style={{ maxWidth: 'calc(100vw - 120px)', maxHeight: 'calc(100vh - 120px)', objectFit: 'contain', borderRadius: 2 }}
              onClick={(e) => e.stopPropagation()}
            />
            <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', borderRadius: 2, fontSize: fontSize.sm, color: '#fff' }}>
              {photos[expandedIndex]!.label} · {expandedIndex + 1} / {photos.length}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(modalContent, document.body)
}
