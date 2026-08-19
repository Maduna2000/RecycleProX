'use client'

/**
 * Layout primitives of the officer-portal look: folder tabs on a white
 * content card, filter bars, field wrappers, and small display helpers.
 */

import { colors } from '@/lib/design-tokens'
import { NAVY, CARD_BORDER, lbl } from './styles'
import { useIsWindowFloating } from '@/lib/windowFloatingContext'

// ─── Field / FormLabel ────────────────────────────────────────────────────────

export function FormLabel({ required, children }: { required?: boolean; children: React.ReactNode }) {
  return (
    <label style={lbl}>
      {children}
      {required && <span style={{ color: colors.danger }}> *</span>}
    </label>
  )
}

/** Label-above-control wrapper for filter bars and forms. */
export function Field({
  label,
  required,
  hint,
  width,
  style,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  width?: number | string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div style={{ width, ...style }}>
      <FormLabel required={required}>{label}</FormLabel>
      {children}
      {hint && <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>{hint}</p>}
    </div>
  )
}

// ─── TabStrip ─────────────────────────────────────────────────────────────────

export interface RpxTab {
  value:  string
  label:  string
  icon?:  React.ElementType
  count?: number
}

/**
 * Folder-style tabs — white active, gray inactive, attached to the card
 * below. Classic legacy-Windows property-sheet look: tabs sit directly
 * adjacent (no gaps), each sharing its left border with the previous tab's
 * right border, so the row reads as one continuous strip rather than
 * separate floating chips. The active tab renders above its neighbours
 * (higher z-index) so its own borders stay crisp at the shared edges.
 *
 * The strip scrolls horizontally rather than wrapping or squeezing tab text
 * when there isn't room for every tab (e.g. an account customer's full
 * 10-tab row on a narrower screen) — each tab keeps its natural width
 * (flexShrink: 0) and the outer row is allowed to shrink within its own
 * flex parent, so overflow becomes a scrollbar instead of silently
 * clipping tabs (and whatever sits after the strip, like an Edit button)
 * off the edge of the screen with no way to reach them.
 */
export function TabStrip({
  tabs,
  active,
  onChange,
  style,
}: {
  tabs: RpxTab[]
  active: string
  onChange: (value: string) => void
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', minWidth: 0, overflowX: 'auto', ...style }}>
      {tabs.map((t, i) => {
        const isActive = t.value === active
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            style={{
              flexShrink: 0,
              position: 'relative', zIndex: isActive ? 2 : 1,
              marginLeft: i === 0 ? 0 : -1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', fontSize: 12, fontWeight: 600,
              // Light top edge (raised highlight) + the same #B0B0B0 side
              // dividers as before (unchanged so adjacent tabs' shared
              // edges still align) — a hard highlight instead of a soft
              // GLOSS_BEVEL box-shadow standing in for one.
              borderTop: '1px solid #FFFFFF',
              borderLeft: '1px solid #B0B0B0', borderRight: '1px solid #B0B0B0',
              borderBottom: 'none',
              borderRadius: '4px 4px 0 0', cursor: 'pointer',
              background: isActive
                ? 'linear-gradient(180deg,#FFFFFF 0%,#F2F2F2 100%)'
                : 'linear-gradient(180deg,#E8E8E8 0%,#D0D0D0 100%)',
              color: isActive ? NAVY : '#6C757D',
            }}
          >
            {t.icon && <t.icon style={{ width: 13, height: 13 }} />}
            {t.label}
            {t.count !== undefined && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '0 5px',
                borderRadius: 8, background: isActive ? '#EBF3FC' : '#CFCFCF',
                color: isActive ? NAVY : '#555',
              }}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── ContentCard ──────────────────────────────────────────────────────────────

/**
 * White content card. Both top corners always stay square (radius 0):
 * top-left because it sits directly under either PageTitleBar's own
 * square-left edge or a tab's left edge, and top-right because PageTitleBar
 * spans this same width and its own bottom-right corner is unconditionally
 * square (see PageTitleBar.tsx's `3px 3px 0 0`) — rounding this card's
 * top-right corner instead left a visible notch where the two borders met,
 * since a square corner directly above a rounded one never actually lines
 * up. `attached` squares the top-left corner under a PortalPage `tabs` row
 * (that row owns the seam with its own top border, ContentCard keeps its
 * top border there to meet it).
 *
 * When there's no tab row, PageTitleBar sits directly above this card and
 * always owns the top edge now (see PageTitleBar.tsx) — so the default
 * (non-attached) shape drops its own top border, fusing into one continuous
 * window frame instead of doubling the line PageTitleBar already draws.
 * Pages used to opt into this by hand via `cardStyle`; it's the default now
 * so no page can forget it.
 */
export function ContentCard({
  attached,
  style,
  children,
}: {
  attached?: boolean
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        background: '#fff', border: CARD_BORDER, overflow: 'hidden',
        borderRadius: '0 0 3px 3px',
        ...(attached ? {} : { borderTop: 'none' }),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── PortalPage ───────────────────────────────────────────────────────────────

/**
 * The standard page silhouette. The page's title already lives once in the
 * windowed title bar above (PageTitleBar) — folder tabs only render here
 * when a page genuinely has more than one section to switch between. A
 * single implicit tab built from `title` would just repeat that title, so
 * pages with no real `tabs` get a plain content card instead (with a
 * right-aligned action slot when `actions` is given).
 */
export function PortalPage({
  tabs,
  active,
  onChange,
  title,
  actions,
  children,
  cardStyle,
  maxWidth,
}: {
  tabs?: RpxTab[]
  active?: string
  onChange?: (value: string) => void
  /** Used for the region's accessible name; no longer rendered as a tab. */
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  cardStyle?: React.CSSProperties
  /**
   * Caps and centers the tab row (if any) and ContentCard together to this
   * width, instead of the default full-bleed layout — for pages that don't
   * need the full window width (see src/lib/pageWidthCaps.ts). This is only
   * the window's *default* width now, not a permanent ceiling: once the
   * user has manually resized the enclosing FloatingWindowFrame wider (see
   * useIsWindowFloating below), this cap stops applying so the table/content
   * actually grows with the window instead of staying stuck at its original
   * size while only the window's border moves. Outside a FloatingWindowFrame
   * (the standalone police/scale/gate/ledger apps), the cap always applies.
   */
  maxWidth?: number
}) {
  const hasTabs = !!tabs && tabs.length > 0
  const isFloating = useIsWindowFloating()
  const effectiveMaxWidth = isFloating ? undefined : maxWidth

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      aria-label={hasTabs ? undefined : title}
    >
      <div style={effectiveMaxWidth ? { width: '100%', maxWidth: effectiveMaxWidth, margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {(hasTabs || actions) && (
        // Only the tab buttons themselves draw a border — the row's own
        // background is transparent, so the stretch beside them (there's
        // always some once actions don't fill the rest, and always all of
        // it when there's no `actions` at all) showed bare page background
        // instead of any line, for the row's full height, before
        // ContentCard's own top border finally closed things off one row
        // below. That read as the frame not connecting on that side. A
        // border-bottom here — the same CARD_BORDER ContentCard already
        // draws — closes the seam continuously across the full width
        // immediately below the title bar, no matter where the tabs end.
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexShrink: 0, borderBottom: CARD_BORDER }}>
          {hasTabs && (
            <TabStrip tabs={tabs!} active={active ?? tabs![0]?.value ?? ''} onChange={onChange ?? (() => {})} />
          )}
          <div style={{ flex: 1 }} />
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 5 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <ContentCard attached={hasTabs} style={cardStyle}>
        {children}
      </ContentCard>
      </div>
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

/** The filter/search row that sits at the top of a content card. */
export function FilterBar({ style, children }: { style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-end', gap: 10,
        padding: '10px 14px', borderBottom: '1px solid #E0E0E0',
        flexShrink: 0, flexWrap: 'wrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Small display helpers ────────────────────────────────────────────────────

export function EmptyHint({ text, height = 160 }: { text: string; height?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, color: '#6C757D', fontSize: 12.5 }}>
      {text}
    </div>
  )
}

export function SectionLabel({ text }: { text: string }) {
  return <p style={{ ...lbl, marginTop: 12, marginBottom: 6 }}>{text}</p>
}

/** Definition list — label/value rows with hairline separators. */
export function DL({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div style={{ marginBottom: 6 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', padding: '3px 0', borderBottom: '1px solid #F5F5F5' }}>
          <span style={{ width: 130, fontSize: 11, fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: 12.5, color: '#212529' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
