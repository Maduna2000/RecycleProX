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

import { useState } from 'react'
import { X } from 'lucide-react'
import { DialogContent } from '@/components/ui/dialog'
import { BAR_GRAD, winBevel, windowTitleText } from './styles'

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
      // Cancel the shadcn base's rounded-xl + soft ring at the className
      // level (not just via inline style) — tailwind-merge dedupes same-
      // category utilities so these win outright, rather than relying on
      // inline style to out-specificity a ring's composited box-shadow.
      className="p-0 gap-0 rounded-[3px] ring-0"
      showCloseButton={false}
      style={{
        maxWidth,
        borderRadius: 3,
        boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
        background: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100dvh - 4rem)',
        // The whole dialog reads as one raised physical window (same hard
        // bevel as PageTitleBar/Btn) — the header inside it is a flat strip,
        // not a second nested bevel.
        ...winBevel(),
        ...style,
      }}
    >
      {children}
    </DialogContent>
  )
}

/** The dialog's own close button — same raised-bevel window control as
 * PageTitleBar's [−]/[×] (see components/ui/PageTitleBar.tsx), just without
 * a minimize button since modals aren't minimizable. */
function DialogCloseButton({ onClose }: { onClose: () => void }) {
  const [pressed, setPressed] = useState(false)
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={onClose}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title="Close"
      aria-label="Close"
      style={{
        width: 22, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: pressed ? 'linear-gradient(180deg,#D4D4D4 0%,#EAEAEA 100%)' : BAR_GRAD,
        borderRadius: 2, cursor: 'pointer',
        transform: pressed ? 'translateY(1px)' : undefined,
        color: hover ? '#C0392B' : '#495057',
        ...winBevel(pressed),
      }}
    >
      <X style={{ width: 12, height: 12 }} />
    </button>
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...windowTitleText }}>
        {Icon && <Icon style={{ width: 14, height: 14 }} />}
        {title}
      </span>
      {onClose && <DialogCloseButton onClose={onClose} />}
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
