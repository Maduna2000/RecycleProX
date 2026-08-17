/**
 * Pages whose own content is capped to a centered, narrower-than-full-width
 * block (see each page's own `cardStyle` on PortalPage) — PageTitleBar reads
 * this to cap/border itself to match, so the windowed title bar fuses into
 * one framed box with the content beneath it instead of spanning the full
 * window width above a narrower page.
 */
const PAGE_WIDTH_CAPS: { test: RegExp; width: number }[] = [
  // Customer detail ("view profile") page only — not the Accounts list or
  // the "new customer" form, which still span full width.
  { test: /^\/app\/customers\/[^/]+$/, width: 960 },
  { test: /^\/app\/police-register$/, width: 960 },
  // Matches Float's own `max-w-3xl` (768px) content wrapper.
  { test: /^\/app\/float$/, width: 768 },
  // Matches Cash-Up's own `max-w-6xl` (1152px) content wrapper.
  { test: /^\/app\/cashup$/, width: 1152 },
  // Stock module — all three pages have the same unbounded-"Product"-column
  // problem; capping each keeps its table reasonable instead of stretching
  // to fill the whole window.
  { test: /^\/app\/stock$/, width: 1100 },
  { test: /^\/app\/stock\/movements$/, width: 950 },
  { test: /^\/app\/stock\/grid$/, width: 1000 },
  // Products — the unbounded "Name" column stretched to fill whatever width
  // was left.
  { test: /^\/app\/products$/, width: 950 },
  // Price Groups — the unbounded "Name" and "Description" columns did the
  // same.
  { test: /^\/app\/price-groups$/, width: 900 },
]

export function getPageWidthCap(pathname: string): number | null {
  if (pathname === '/app/customers/new') return null
  const match = PAGE_WIDTH_CAPS.find((c) => c.test.test(pathname))
  return match?.width ?? null
}
