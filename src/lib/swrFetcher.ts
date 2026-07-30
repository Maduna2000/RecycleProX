// Shared SWR fetcher — checks res.ok before parsing, so a real server error
// (401/403/500, dropped connection) surfaces via SWR's `error` state instead
// of silently resolving as if it were valid empty data. A bare
// `fetch(url).then(r => r.json())` (the pattern this replaces) was found
// duplicated across dozens of pages and caused a real production bug: the
// Cash-up "Previous Reports" modal always showed "No previous sessions
// found" on any API failure, because the error body parsed fine as JSON and
// nothing ever checked it wasn't the real shape.
export async function fetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}
