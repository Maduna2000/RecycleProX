'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { btnPrimary, btnSecondary, btnDanger, btnPressed, BAR_GRAD, winBevel } from './styles'

export type BtnVariant = 'primary' | 'secondary' | 'danger'
export type BtnSize = 'md' | 'sm'

const VARIANT_STYLE: Record<BtnVariant, React.CSSProperties> = {
  primary:   btnPrimary,
  secondary: btnSecondary,
  danger:    btnDanger,
}

// All three variants share the same flat grey fill — hover/leave just
// swap between the gradient (idle) and a slightly darker flat grey (hover).
const HOVER_BG: Record<BtnVariant, string> = {
  primary:   '#D2D2D2',
  secondary: '#D2D2D2',
  danger:    '#D2D2D2',
}

const BASE_BG: Record<BtnVariant, string> = {
  primary:   BAR_GRAD,
  secondary: BAR_GRAD,
  danger:    BAR_GRAD,
}

/** Compact scale — fits the 32px toolbar strip and dense rows. Fixed height
 * (not padding-derived), same reasoning as the md size in styles.ts. */
const SM_OVERRIDE: React.CSSProperties = { height: 24, fontSize: 11, padding: '0 12px' }

/** Swaps a button element's raised bevel for the inverted/pushed-in one —
 * imperative DOM writes, same pattern as the existing hover handlers below,
 * since these are inline styles rather than CSS classes with :active. */
function setBevel(el: HTMLElement, pressed: boolean) {
  const bevel = winBevel(pressed)
  el.style.borderTop    = bevel.borderTop    as string
  el.style.borderLeft   = bevel.borderLeft   as string
  el.style.borderRight  = bevel.borderRight  as string
  el.style.borderBottom = bevel.borderBottom as string
}

export interface BtnProps {
  variant?:  BtnVariant
  size?:     BtnSize
  icon?:     React.ElementType
  loading?:  boolean
  disabled?: boolean
  type?:     'button' | 'submit'
  /** Associates this button with a <form> elsewhere in the DOM (id reference). */
  form?:     string
  href?:     string
  target?:   string
  title?:    string
  onClick?:  (e: React.MouseEvent) => void
  style?:    React.CSSProperties
  /** Custom hover background — needed when `style.background` overrides the variant. */
  hoverBg?:  string
  children?: React.ReactNode
}

/**
 * The standard Renovo Pro button: navy primary, light-blue secondary, red danger.
 * Renders a Link when `href` is given (PDF downloads, navigation actions).
 */
export function Btn({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  disabled,
  type = 'button',
  form,
  href,
  target,
  title,
  onClick,
  style,
  hoverBg,
  children,
}: BtnProps) {
  const inactive = disabled || loading
  const iconSize = variant === 'primary' && size === 'md' ? 13 : 11

  const merged: React.CSSProperties = {
    ...VARIANT_STYLE[variant],
    ...(size === 'sm' ? SM_OVERRIDE : {}),
    ...(inactive ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
    ...(href ? { textDecoration: 'none' } : {}),
    ...style,
  }

  const handleEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (!inactive) e.currentTarget.style.background = hoverBg ?? HOVER_BG[variant]
  }
  const handleLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (!inactive) {
      e.currentTarget.style.background = (style?.background as string) ?? BASE_BG[variant]
      e.currentTarget.style.transform = ''
      setBevel(e.currentTarget, false)
    }
  }
  // Real pressed feedback — the button visibly pushes in on click instead
  // of only changing shade on hover.
  const handleDown = (e: React.MouseEvent<HTMLElement>) => {
    if (!inactive) {
      e.currentTarget.style.background = btnPressed.background as string
      e.currentTarget.style.transform = 'translateY(1px)'
      setBevel(e.currentTarget, true)
    }
  }
  const handleUp = (e: React.MouseEvent<HTMLElement>) => {
    if (!inactive) {
      e.currentTarget.style.background = hoverBg ?? HOVER_BG[variant]
      e.currentTarget.style.transform = ''
      setBevel(e.currentTarget, false)
    }
  }

  const inner = (
    <>
      {loading
        ? <Loader2 className="animate-spin" style={{ width: iconSize, height: iconSize, flexShrink: 0 }} />
        : Icon && <Icon style={{ width: iconSize, height: iconSize, flexShrink: 0 }} />}
      {children}
    </>
  )

  if (href && !inactive) {
    return (
      <Link
        href={href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        title={title}
        style={merged}
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
      >
        {inner}
      </Link>
    )
  }

  return (
    <button
      type={type}
      form={form}
      title={title}
      disabled={inactive}
      style={merged}
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseDown={handleDown}
      onMouseUp={handleUp}
    >
      {inner}
    </button>
  )
}
