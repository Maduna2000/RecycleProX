'use client'

/**
 * The standard Renovo Pro dialog: shadcn/base-ui Dialog shell (focus trap,
 * portal, animation) dressed in the officer-portal look — gradient title bar,
 * navy title, gray footer with Btn actions.
 *
 * Compose:
 *   <Dialog open onOpenChange={...}>
 *     <RpxDialogContent maxWidth={560}>
 *       <RpxDialogHeader title="Edit Product" onClose={close} />
 *       <RpxDialogBody> ... fields ... </RpxDialogBody>
 *       <RpxDialogFooter>
 *         <Btn onClick={close}>Cancel</Btn>
 *         <Btn variant="primary" onClick={save}>Save</Btn>
 *       </RpxDialogFooter>
 *     </RpxDialogContent>
 *   </Dialog>
 */

import { X } from 'lucide-react'
import { DialogContent } from '@/components/ui/dialog'
import { NAVY, BAR_GRAD } from './styles'

export function RpxDialogContent({
  maxWidth = 480,
  style,
  children,
}: {
  maxWidth?: number
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <DialogContent
      className="p-0 gap-0"
      showCloseButton={false}
      style={{
        maxWidth,
        borderRadius: 10,
        border: '1px solid #B0B0B0',
        boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
        background: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100dvh - 4rem)',
        ...style,
      }}
    >
      {children}
    </DialogContent>
  )
}

export function RpxDialogHeader({
  title,
  icon: Icon,
  onClose,
}: {
  title: React.ReactNode
  icon?: React.ElementType
  onClose?: () => void
}) {
  return (
    <div
      className="select-none"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 34, padding: '0 8px 0 14px', flexShrink: 0,
        background: BAR_GRAD, borderBottom: '2px solid #B0B0B0',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: NAVY }}>
        {Icon && <Icon style={{ width: 14, height: 14 }} />}
        {title}
      </span>
      {onClose && (
        <button
          onClick={onClose}
          title="Close"
          aria-label="Close"
          style={{
            width: 24, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', borderRadius: 2, color: '#6C757D',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6C757D' }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  )
}

export function RpxDialogBody({ style, children }: { style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', overflowY: 'auto', minHeight: 0, ...style }}>
      {children}
    </div>
  )
}

export function RpxDialogFooter({ style, children }: { style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderTop: '1px solid #E0E0E0', background: '#F8F9FA',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
