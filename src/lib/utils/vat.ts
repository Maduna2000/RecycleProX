import Decimal from 'decimal.js'

/**
 * VAT derivation helpers — the ONE place legacy-fallback VAT logic lives.
 *
 * New purchases (after the per-line VAT persistence cutover) store vatAmount on
 * every line and on the header; totalAmount is VAT-inclusive. Legacy rows have
 * vatAmount = null, and their totalAmount is treated as VAT-inclusive (÷1.15)
 * unless the customer is zero-rated — consistent with how listPurchases has
 * always presented them.
 *
 * Rule for report builders: a report column must always sum a single
 * derivation level (all header-derived or all line-derived) — never mix the
 * two in one total, or rounding drift of cents appears between levels.
 */

export const VAT_RATE = new Decimal('0.15')
export const VAT_DIVISOR = new Decimal('1.15')

type DecimalLike = { toString(): string }

/** VAT for a purchase line. Persisted value wins; legacy rows derive from the inclusive lineTotal. */
export function purchaseLineVat(
  line: { vatAmount: DecimalLike | null; lineTotal: DecimalLike },
  zeroRated: boolean
): Decimal {
  if (line.vatAmount !== null && line.vatAmount !== undefined) {
    return new Decimal(line.vatAmount.toString())
  }
  if (zeroRated) return new Decimal(0)
  const gross = new Decimal(line.lineTotal.toString())
  return gross.minus(gross.div(VAT_DIVISOR).toDecimalPlaces(2)).toDecimalPlaces(2)
}

/** VAT for a purchase header. Persisted value wins; legacy rows derive from the inclusive totalAmount. */
export function purchaseHeaderVat(
  purchase: { vatAmount: DecimalLike | null; totalAmount: DecimalLike },
  zeroRated: boolean
): Decimal {
  if (purchase.vatAmount !== null && purchase.vatAmount !== undefined) {
    return new Decimal(purchase.vatAmount.toString())
  }
  if (zeroRated) return new Decimal(0)
  const gross = new Decimal(purchase.totalAmount.toString())
  return gross.minus(gross.div(VAT_DIVISOR).toDecimalPlaces(2)).toDecimalPlaces(2)
}

/**
 * Per-line VAT for a sale. Sales apply one uniform rate per sale (header
 * vatAmount is authoritative), so a line's share is exact: lineTotal × 0.15
 * when the sale carried VAT, else 0.
 */
export function saleLineVat(
  line: { lineTotal: DecimalLike },
  saleHasVat: boolean
): Decimal {
  if (!saleHasVat) return new Decimal(0)
  return new Decimal(line.lineTotal.toString()).times(VAT_RATE).toDecimalPlaces(2)
}
