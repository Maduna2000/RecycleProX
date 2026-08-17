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
  // Stock On Hand — the unbounded "Product" column stretched to fill
  // whatever width was left; capping the page keeps it reasonable.
  { test: /^\/app\/stock$/, width: 1100 },
]

export function getPageWidthCap(pathname: string): number | null {
  if (pathname === '/app/customers/new') return null
  const match = PAGE_WIDTH_CAPS.find((c) => c.test.test(pathname))
  return match?.width ?? null
}
