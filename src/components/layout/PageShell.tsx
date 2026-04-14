'use client'

/**
 * PageShell — wraps every page's Zone 3 content.
 *
 * Sits INSIDE AppShell's content area.
 * Provides consistent page-title typography, optional subtitle/count,
 * optional tab bar, and a flex-column content slot.
 *
 * Usage:
 *   <PageShell title="Customers" subtitle="247 customers">
 *     <DataTable ... />
 *   </PageShell>
 */

import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tab {
  value:   string
  label:   string
  count?:  number
}

interface PageShellProps {
  title:      string
  subtitle?:  string       // e.g. "247 customers" or "Record and manage purchases"
  tabs?:      readonly Tab[]   // renders inside Zone 3, below the header
  activeTab?: string
  onTabChange?: (value: string) => void
  children:   React.ReactNode
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PageShell({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  children,
}: PageShellProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Page header */}
      <div className="shrink-0">
        <h1 style={{
          fontSize:   fontSize.lg,
          fontWeight: fontWeight.semibold,
          color:      colors.textPrimary,
          lineHeight: 1.3,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize:   fontSize.sm,
            color:      colors.textSecondary,
            marginTop:  2,
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Tab bar — inside Zone 3, never in the AppShell toolbar */}
      {tabs && tabs.length > 0 && (
        <div
          className="flex gap-0 shrink-0 border-b"
          style={{ borderColor: colors.border, marginBottom: -8 }}
        >
          {tabs.map((tab) => {
            const isActive = tab.value === activeTab
            return (
              <button
                key={tab.value}
                onClick={() => onTabChange?.(tab.value)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors focus:outline-none"
                style={{
                  borderBottomColor: isActive ? colors.process : 'transparent',
                  color:             isActive ? colors.process : colors.textSecondary,
                  background:        'transparent',
                }}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className="px-1.5 py-0.5 rounded-full"
                    style={{
                      fontSize:   fontSize.xs,
                      fontWeight: fontWeight.medium,
                      color:      isActive ? colors.process : colors.textSecondary,
                      background: isActive ? colors.processBg : colors.neutralBg,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Content slot */}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  )
}
