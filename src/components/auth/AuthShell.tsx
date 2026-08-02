'use client'

/**
 * Shared presentational chrome for all three login screens (/login,
 * /gate/login, /scale/login) — outer background, card border/radius,
 * icon badge, title, error-banner slot, and the session-loading splash.
 * Each page still owns 100% of its own onSubmit/signIn/role-check/redirect
 * logic; only the JSX wrapping the form is unified here. `accentColor`
 * is the one thing that stays per-kiosk (navy/blue/emerald) so the three
 * screens read as related, not identical — see the "differentiate mirrored
 * features" convention used elsewhere (Loan vs Business Loan, Gate vs Scale).
 */

import { Loader2, AlertCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { CARD_BORDER } from '@/components/rpx'

export interface AuthShellProps {
  /** Per-kiosk accent — badge fill, focus ring, spinner color. */
  accentColor: string
  /** Ready-made badge content (colored div + Lucide icon, or the brand mark image) — sized to fill the 64×64 wrapper. Ignored when `logo` is given. */
  icon?: React.ReactNode
  title?: string
  /**
   * Full wordmark lockup (icon + "RENOVO PRO" + slogan) — when given, this
   * replaces the icon badge + title entirely instead of being squeezed into
   * the 64×64 icon slot. Used by the main login; the gate/scale kiosk
   * logins keep the plain icon+title so their per-kiosk accent still shows.
   */
  logo?: React.ReactNode
  subtitle?: string
  errorMessage?: string | null
  isSessionLoading?: boolean
  children: React.ReactNode
}

export function AuthShell({ accentColor, icon, title, logo, subtitle, errorMessage, isSessionLoading, children }: AuthShellProps) {
  const background = `radial-gradient(ellipse at 50% 0%, ${accentColor}59 0%, #0F203A 60%)`

  if (isSessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: accentColor }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background }}>
      <div className="w-full max-w-sm sm:max-w-md">
        <div
          style={{
            background: '#fff',
            border: CARD_BORDER,
            borderRadius: 3,
            boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
            padding: '32px 28px',
          }}
        >
          <div className="flex flex-col items-center mb-7">
            {logo ?? (
              <>
                <div
                  style={{
                    width: 64, height: 64, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                    marginBottom: 14, boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                  }}
                >
                  {icon}
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.mainInstruction, textAlign: 'center' }}>{title}</h1>
              </>
            )}
            {subtitle && <p style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>{subtitle}</p>}
          </div>

          {errorMessage && (
            <div
              style={{
                marginBottom: 18, padding: '10px 12px', borderRadius: 3, fontSize: 13,
                background: colors.dangerBg, border: `1px solid ${colors.danger}`, color: colors.danger,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}
            >
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {children}

          <p className="text-center" style={{ fontSize: 11, color: colors.textMuted, marginTop: 22 }}>
            Accounts are created by an administrator
          </p>
        </div>
      </div>
    </div>
  )
}
