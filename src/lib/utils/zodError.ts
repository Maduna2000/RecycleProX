import type { ZodError } from 'zod'

const FIELD_LABELS: Record<string, string> = {
  unitPrice: 'Unit price',
  quantity: 'Quantity',
  grossQty: 'Gross weight',
  tareQty: 'Tare weight',
  deductionQty: 'Deduction',
  deductionReason: 'Deduction reason',
  productId: 'Product',
  customerId: 'Customer',
  buyerName: 'Buyer name',
  paymentMethod: 'Payment method',
}

function label(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function issueLocation(path: PropertyKey[]): string {
  const parts: string[] = []
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]!
    if (seg === 'lines' && typeof path[i + 1] === 'number') {
      parts.push(`Line ${(path[i + 1] as number) + 1}`)
      i++
    } else if (typeof seg === 'string') {
      parts.push(label(seg))
    }
  }
  return parts.join(' – ')
}

/**
 * One human-readable sentence for a failed Zod parse, e.g.
 * "Line 2 – Unit price: Price can have at most 2 decimal places (e.g. 227.24)".
 * API routes return this as `error` (a plain string every client can show)
 * and keep the structured `flatten()` output under `details`.
 */
export function zodErrorMessage(err: ZodError): string {
  const messages = err.issues.map((issue) => {
    const where = issueLocation(issue.path)
    return where ? `${where}: ${issue.message}` : issue.message
  })
  const unique = [...new Set(messages)]
  if (unique.length === 0) return 'Invalid request'
  const shown = unique.slice(0, 3).join('; ')
  return unique.length > 3 ? `${shown} (and ${unique.length - 3} more)` : shown
}
