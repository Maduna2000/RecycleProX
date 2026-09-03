'use client'

/**
 * True only for Safari (desktop or iOS/iPadOS) — every other browser also
 * carries "Safari" in its UA string, so Chrome/Chromium/Firefox/Edge markers
 * are explicitly excluded. iPadOS reports as "MacIntel" with touch support,
 * so that combination is treated as Safari too.
 */
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isWebkitSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\//.test(ua)
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isWebkitSafari || isIPadOS
}

/**
 * Force-save a Blob to disk. Safari (macOS/iOS) has a built-in PDF viewer and
 * will open a PDF blob URL inline — ignoring the anchor `download` attribute
 * — instead of saving it, which is the "downloads don't work on Safari"
 * complaint this exists to fix. Re-tagging the blob as a generic binary type
 * removes Safari's built-in viewer from consideration so it falls back to a
 * save prompt. Other browsers download the PDF type as-is, unaffected.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const effectiveBlob = isSafari() && blob.type === 'application/pdf'
    ? new Blob([blob], { type: 'application/octet-stream' })
    : blob

  const url = URL.createObjectURL(effectiveBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Safari can abandon the save if the object URL is revoked immediately
  // after the click; give it a moment to actually start reading it.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Fetch a report/export endpoint's response body and force-save it as `filename`. */
export async function downloadResponse(res: Response, filename: string): Promise<void> {
  const blob = await res.blob()
  downloadBlob(blob, filename)
}
