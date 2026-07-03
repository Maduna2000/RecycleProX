/**
 * Minimal PNG metadata reader — enough to validate a company logo upload
 * (dimensions + alpha-channel support) without an image library.
 */

export interface PngMeta {
  width: number
  height: number
  /** PNG color type: 0 gray, 2 rgb, 3 palette, 4 gray+alpha, 6 rgba */
  colorType: number
  /** True when the file can carry a transparent background. */
  hasAlpha: boolean
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Returns null when the buffer is not a valid PNG. */
export function readPngMeta(bytes: Uint8Array): PngMeta | null {
  if (bytes.length < 33) return null
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // First chunk must be IHDR (length at 8, type at 12, data at 16)
  const ihdrType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!)
  if (ihdrType !== 'IHDR') return null

  const width = view.getUint32(16)
  const height = view.getUint32(20)
  const colorType = bytes[25]!

  // Color types 4 (gray+alpha) and 6 (RGBA) carry a real alpha channel;
  // palette (3) images can add transparency via a tRNS chunk.
  let hasAlpha = colorType === 4 || colorType === 6
  if (!hasAlpha && colorType === 3) {
    // Walk chunks looking for tRNS (stop at the image data)
    let offset = 8
    while (offset + 8 <= bytes.length) {
      const len = view.getUint32(offset)
      const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!)
      if (type === 'tRNS') { hasAlpha = true; break }
      if (type === 'IDAT' || type === 'IEND') break
      offset += 12 + len // length + type + data + crc
    }
  }

  return { width, height, colorType, hasAlpha }
}
