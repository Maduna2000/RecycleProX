'use client'

import { useState, useCallback, createContext, useContext, ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AlertTriangle, Trash2, X, HelpCircle } from 'lucide-react'
import { colors, fontSize } from '@/lib/design-tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmVariant = 'danger' | 'warning' | 'info'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmDialogState extends ConfirmOptions {
  open: boolean
  resolve: ((value: boolean) => void) | null
}

// ─── Context for imperative API ───────────────────────────────────────────────

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

/**
 * Hook to access the confirm dialog imperatively.
 *
 * @example
 * const { confirm } = useConfirm()
 *
 * async function handleVoid() {
 *   const confirmed = await confirm({
 *     title: 'Void Expense',
 *     message: 'Are you sure you want to void this expense? This cannot be undone.',
 *     variant: 'danger',
 *     confirmLabel: 'Void',
 *   })
 *   if (!confirmed) return
 *   // proceed with void action
 * }
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider')
  }
  return ctx
}

// ─── Provider Component ───────────────────────────────────────────────────────

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'danger',
    resolve: null,
  })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        variant: options.variant ?? 'danger',
        resolve,
      })
    })
  }, [])

  const handleClose = useCallback((confirmed: boolean) => {
    setState((prev) => {
      if (prev.resolve) {
        prev.resolve(confirmed)
      }
      return { ...prev, open: false, resolve: null }
    })
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialogInner
        open={state.open}
        title={state.title}
        message={state.message}
        confirmLabel={state.confirmLabel ?? 'Confirm'}
        cancelLabel={state.cancelLabel ?? 'Cancel'}
        variant={state.variant ?? 'danger'}
        onConfirm={() => handleClose(true)}
        onCancel={() => handleClose(false)}
      />
    </ConfirmContext.Provider>
  )
}

// ─── Internal Dialog Component ────────────────────────────────────────────────

interface ConfirmDialogInnerProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  variant: ConfirmVariant
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialogInner({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant,
  onConfirm,
  onCancel,
}: ConfirmDialogInnerProps) {
  if (!open) return null

  const variantConfig = {
    danger: {
      icon: Trash2,
      iconColor: colors.danger,
      iconBg: colors.dangerBg,
      confirmBg: colors.danger,
      confirmHover: '#A93226',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: colors.warning,
      iconBg: colors.warningBg,
      confirmBg: colors.warning,
      confirmHover: '#B8860B',
    },
    info: {
      icon: HelpCircle,
      iconColor: colors.process,
      iconBg: colors.processBg,
      confirmBg: colors.process,
      confirmHover: colors.processHover,
    },
  }

  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent
        className="sm:max-w-sm p-0"
        showCloseButton={false}
        style={{
          borderRadius: 2,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: colors.surface,
        }}
      >
        {/* Windows-style title bar */}
        <div
          style={{
            background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)',
            borderBottom: `1px solid ${colors.border}`,
            padding: '6px 8px 6px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary }}>
            {title}
          </span>
          <button
            onClick={onCancel}
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 2,
              color: colors.textSecondary,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textSecondary }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', display: 'flex', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              background: config.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon style={{ width: 20, height: 20, color: config.iconColor }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: fontSize.base, color: colors.textPrimary, lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 16px',
            borderTop: `1px solid ${colors.border}`,
            background: 'linear-gradient(180deg, #F5F5F5 0%, #ECECEC 100%)',
          }}
        >
          <ConfirmButton onClick={onCancel} variant="cancel">
            {cancelLabel}
          </ConfirmButton>
          <ConfirmButton
            onClick={onConfirm}
            variant="confirm"
            bgColor={config.confirmBg}
            hoverColor={config.confirmHover}
          >
            {confirmLabel}
          </ConfirmButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Button Component ─────────────────────────────────────────────────────────

interface ConfirmButtonProps {
  onClick: () => void
  variant: 'confirm' | 'cancel'
  bgColor?: string
  hoverColor?: string
  children: ReactNode
}

function ConfirmButton({ onClick, variant, bgColor, hoverColor, children }: ConfirmButtonProps) {
  const isCancel = variant === 'cancel'

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '6px 14px',
    fontSize: fontSize.sm,
    fontWeight: 600,
    borderRadius: 2,
    cursor: 'pointer',
    transition: 'background 0.1s',
    minWidth: 70,
  }

  const cancelStyle: React.CSSProperties = {
    ...baseStyle,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    color: colors.textPrimary,
  }

  const confirmStyle: React.CSSProperties = {
    ...baseStyle,
    background: bgColor ?? colors.danger,
    border: 'none',
    color: colors.textOnDark,
  }

  return (
    <button
      onClick={onClick}
      style={isCancel ? cancelStyle : confirmStyle}
      onMouseEnter={(e) => {
        if (isCancel) {
          e.currentTarget.style.background = '#F8F9FA'
        } else if (hoverColor) {
          e.currentTarget.style.background = hoverColor
        }
      }}
      onMouseLeave={(e) => {
        if (isCancel) {
          e.currentTarget.style.background = colors.surface
        } else if (bgColor) {
          e.currentTarget.style.background = bgColor
        }
      }}
    >
      {children}
    </button>
  )
}

// ─── Standalone Component (for declarative usage) ─────────────────────────────

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  onConfirm: () => void
}

/**
 * Standalone ConfirmDialog component for declarative usage.
 *
 * @example
 * const [confirmOpen, setConfirmOpen] = useState(false)
 *
 * <ConfirmDialog
 *   open={confirmOpen}
 *   onOpenChange={setConfirmOpen}
 *   title="Delete Item"
 *   message="Are you sure you want to delete this item?"
 *   variant="danger"
 *   confirmLabel="Delete"
 *   onConfirm={() => handleDelete()}
 * />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ConfirmDialogInner
      open={open}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      variant={variant}
      onConfirm={() => {
        onConfirm()
        onOpenChange(false)
      }}
      onCancel={() => onOpenChange(false)}
    />
  )
}
