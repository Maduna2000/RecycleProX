export interface SaIdResult {
  valid: boolean
  error?: string
  dateOfBirth?: Date
  gender?: 'male' | 'female'
  citizenship?: 'sa' | 'permanent_resident'
}

export function validateSaId(idNumber: string): SaIdResult {
  if (!/^\d{13}$/.test(idNumber)) {
    if (/[^0-9]/.test(idNumber)) return { valid: false, error: 'ID number must contain digits only' }
    if (idNumber.length < 13) return { valid: false, error: 'ID number must be 13 digits' }
    if (idNumber.length > 13) return { valid: false, error: 'ID number must be exactly 13 digits' }
  }

  // Extract date — YYMMDD
  const yy = parseInt(idNumber.substring(0, 2))
  const mm = parseInt(idNumber.substring(2, 4))
  const dd = parseInt(idNumber.substring(4, 6))

  if (mm < 1 || mm > 12) return { valid: false, error: 'ID number contains an invalid month' }
  if (dd < 1 || dd > 31) return { valid: false, error: 'ID number contains an invalid day' }

  // Determine century: year >= current year's last 2 digits → born 1900s, else 2000s
  const currentYear = new Date().getFullYear() % 100
  const fullYear = yy > currentYear ? 1900 + yy : 2000 + yy

  const dateOfBirth = new Date(fullYear, mm - 1, dd)
  // Validate date is real (e.g. Feb 30 would roll over)
  if (
    dateOfBirth.getFullYear() !== fullYear ||
    dateOfBirth.getMonth() !== mm - 1 ||
    dateOfBirth.getDate() !== dd
  ) {
    return { valid: false, error: 'ID number contains an invalid date' }
  }

  // Gender: digits 7-10 (index 6-9)
  const genderDigits = parseInt(idNumber.substring(6, 10))
  const gender: 'male' | 'female' = genderDigits >= 5000 ? 'male' : 'female'

  // Citizenship: digit 11 (index 10)
  const citizenshipDigit = parseInt(idNumber[10]!)
  if (citizenshipDigit !== 0 && citizenshipDigit !== 1) {
    return { valid: false, error: 'ID number has an invalid citizenship digit' }
  }
  const citizenship: 'sa' | 'permanent_resident' = citizenshipDigit === 0 ? 'sa' : 'permanent_resident'

  // Luhn checksum — digit 13 (index 12)
  if (!luhnCheck(idNumber)) {
    return { valid: false, error: 'ID number has an invalid checksum (Luhn)' }
  }

  return { valid: true, dateOfBirth, gender, citizenship }
}

function luhnCheck(id: string): boolean {
  let sum = 0
  let alternate = false
  for (let i = id.length - 1; i >= 0; i--) {
    let n = parseInt(id[i]!)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}
