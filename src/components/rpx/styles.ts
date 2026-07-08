/**
 * Renovo Pro house-style constants — the canonical officer-portal look.
 *
 * Extracted verbatim from the police officer portal (src/app/police/page.tsx),
 * which is the reference design for every page and dialog in the system:
 * navy primary actions, 10px uppercase labels, 30px bordered inputs,
 * gradient sticky table headers, folder tabs on white content cards.
 *
 * Use these for raw elements (`<input style={inp}>`, `<th style={TH}>`);
 * use the sibling components (Btn, Field, TabStrip, …) for anything richer.
 */

export const NAVY = '#1B3A6B'

/** Sticky table-header row background. */
export const HEADER_GRAD = 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)'
/** Dialog / drawer / section title-bar background. */
export const BAR_GRAD = 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)'
/** Outer border of content cards and dialogs. */
export const CARD_BORDER = '1px solid #B0B0B0'

/** Standard 30px input / select / textarea skin. */
export const inp: React.CSSProperties = {
  height: 30, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 8px',
  fontSize: 13, color: '#212529', outline: 'none',
  background: '#fff', boxSizing: 'border-box',
}

/** 10px uppercase field label. */
export const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 3,
}

/** Table header cell — pair with a `HEADER_GRAD` sticky header row. */
export const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 30,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}

/** Table data cell. */
export const TD: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, color: '#212529',
}

/** Navy primary action button. */
export const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, padding: '7px 16px',
  background: NAVY, color: '#fff', border: 'none',
  borderRadius: 3, cursor: 'pointer',
}

/** Light-blue secondary button — pairs with the navy primary. */
export const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 11, fontWeight: 600, padding: '5px 12px',
  background: '#EBF3FC', color: '#185ABD', border: '1px solid #9DBFE8',
  borderRadius: 2, cursor: 'pointer',
}

/** Red destructive button. */
export const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  background: '#DC3545', color: '#fff', border: '1px solid #C82333',
}
