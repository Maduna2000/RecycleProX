'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileText, X } from 'lucide-react'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Btn, BAR_GRAD } from '@/components/rpx'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

interface Props {
  title:    string
  subtitle?: string
  url:      string
  fileName: string
  onClose:  () => void
}

/**
 * Shared single-document viewer — inline preview (image or PDF) with a
 * Download action, styled to match PhotoViewerModal (same header bar, portal,
 * Escape-to-close). Used wherever a compliance/attachment document needs a
 * "View" action instead of a plain new-tab open.
 */
export function DocumentViewerModal({ title, subtitle, url, fileName, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!mounted) return null

  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTENSIONS.has(ext)
  const isPdf = ext === 'pdf'

  // Fetched as a blob rather than a plain <a href download> — the presigned
  // R2 URL is cross-origin, and browsers routinely ignore the `download`
  // attribute (opening the file inline instead) for cross-origin links.
  // A same-origin blob URL forces the save dialog reliably everywhere.
  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } finally {
      setDownloading(false)
    }
  }

  const modalContent = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: colors.surface, border: '1px solid #B0B0B0', borderRadius: 4, width: '100%', maxWidth: isImage ? 900 : 760, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, padding: '0 8px 0 14px', borderBottom: '2px solid #B0B0B0', background: BAR_GRAD }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <FileText style={{ width: 14, height: 14, color: colors.primary, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary }}>{title}</span>
            {subtitle && <span style={{ fontSize: fontSize.xs, color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>}
          </div>
          <button
            onClick={onClose}
            style={{ width: 24, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 2, cursor: 'pointer', color: colors.textSecondary, flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.danger; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textSecondary }}
            aria-label="Close"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={fileName} style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 160px)', objectFit: 'contain' }} />
          ) : isPdf ? (
            <iframe src={url} title={fileName} style={{ width: '100%', height: 'calc(100vh - 160px)', border: 'none', background: '#fff' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 48, color: colors.textSecondary }}>
              <FileText style={{ width: 48, height: 48, opacity: 0.3 }} />
              <span style={{ fontSize: fontSize.sm }}>Preview not available for this file type</span>
            </div>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: colors.surface }}>
          <span style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Btn size="sm" icon={Download} loading={downloading} onClick={handleDownload}>
              Download
            </Btn>
            <Btn size="sm" onClick={onClose}>Close</Btn>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
