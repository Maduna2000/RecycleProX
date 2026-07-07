'use client'

import { useState, useCallback, createContext, useContext, ReactNode } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react'
import { colors, fontSize } from '@/lib/design-tokens'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogFooter } from '@/components/rpx'

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
      <RpxDialogContent maxWidth={400}>
        <RpxDialogHeader title={title} onClose={onCancel} />

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

        <RpxDialogFooter>
          <Btn onClick={onCancel}>{cancelLabel}</Btn>
          <Btn
            variant={variant === 'danger' ? 'danger' : 'primary'}
            style={variant !== 'danger' ? { background: config.confirmBg } : undefined}
            hoverBg={variant !== 'danger' ? config.confirmHover : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
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
