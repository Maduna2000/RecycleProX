/**
 * Eswatini National ID validator.
 *
 * Eswatini national IDs are alphanumeric identifiers issued by the
 * Eswatini Civil Registration Authority. There is no fixed-length
 * checksum requirement (unlike the SA 13-digit Luhn scheme).
 *
 * Accepts: 5–20 characters, letters/digits/hyphens/slashes only.
 */

export interface SaIdResult {
  valid:        boolean
  error?:       string
  // Not extractable from Eswatini IDs — always undefined
  dateOfBirth?: undefined
  gender?:      undefined
}

export function validateSaId(idNumber: string): SaIdResult {
  if (!idNumber || idNumber.trim().length === 0) {
    return { valid: false, error: 'National ID number is required' }
  }

  const trimmed = idNumber.trim()

  if (trimmed.length < 5) {
    return { valid: false, error: 'National ID number is too short (minimum 5 characters)' }
  }
  if (trimmed.length > 20) {
    return { valid: false, error: 'National ID number is too long (maximum 20 characters)' }
  }
  if (!/^[A-Za-z0-9\-\/]+$/.test(trimmed)) {
    return { valid: false, error: 'National ID may only contain letters, digits, hyphens, or slashes' }
  }

  return { valid: true }
}
