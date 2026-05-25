"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon, Minus, X, Loader2 } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function ModalTitleBar({ title, onClose }: { title: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="-mx-4 -mt-4 mb-2 flex items-center justify-between px-3 select-none"
      style={{
        height: 28,
        background: 'rgba(27,58,107,0.05)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        borderRadius: '12px 12px 0 0',
      }}
    >
      <span className="text-[12px] font-semibold text-[#374151]">{title}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={onClose}
          title="Dismiss"
          aria-label="Dismiss"
          className="w-7 h-7 flex items-center justify-center rounded text-[#6B7280] hover:text-[#374151] hover:bg-black/5 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          title="Close"
          aria-label="Close"
          className="w-7 h-7 flex items-center justify-center rounded text-[#6B7280] hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

type ModalBtnVariant = 'primary' | 'outline' | 'danger'

function ModalBtn({
  variant = 'outline', onClick, type = 'button', disabled, loading, icon, children,
}: {
  variant?:  ModalBtnVariant
  onClick?:  () => void
  type?:     'button' | 'submit'
  disabled?: boolean
  loading?:  boolean
  icon?:     React.ReactNode
  children:  React.ReactNode
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 12px', fontSize: 12, fontWeight: 600,
    borderRadius: 2, cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.55 : 1, transition: 'background 0.1s',
    lineHeight: 1.4,
  }
  const variants: Record<ModalBtnVariant, React.CSSProperties> = {
    primary: { background: '#217346', color: '#fff',     border: 'none' },
    outline: { background: '#fff',     color: '#212529', border: '1px solid #E0E0E0' },
    danger:  { background: '#DC3545', color: '#fff',     border: 'none' },
  }
  const hovers: Record<ModalBtnVariant, string> = {
    primary: '#185D38',
    outline: '#F8F9FA',
    danger:  '#C82333',
  }
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={isDisabled ? undefined : (e) => { (e.currentTarget as HTMLButtonElement).style.background = hovers[variant] }}
      onMouseLeave={isDisabled ? undefined : (e) => { (e.currentTarget as HTMLButtonElement).style.background = (variants[variant].background as string) }}
    >
      {loading ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : icon}
      {children}
    </button>
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  ModalBtn,
  ModalTitleBar,
}
