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

/**
 * Price-list VAT direction: EX VAT is canonical (the price someone enters),
 * INC VAT is derived by multiplying it up — the opposite direction from the
 * purchase-legacy helpers above, which divide an inclusive figure back down.
 * Pure (no server-only imports), so this is safe to call from client
 * components too — see TodaysPricesPanel.tsx and the price-list editor,
 * which both need this same figure.
 */
export function incVatPrice(priceExVat: Decimal.Value): Decimal {
  return new Decimal(priceExVat).times(VAT_DIVISOR).toDecimalPlaces(2)
}

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

export interface VatAmounts {
  subTotal: Decimal
  vat: Decimal
  grandTotal: Decimal
}

/**
 * Full sub/VAT/grand breakdown for a purchase line, handling the era split:
 * - New rows (persisted vatAmount): lineTotal is ex-VAT, VAT sits on top →
 *   grand = lineTotal + vatAmount.
 * - Legacy rows (null vatAmount): lineTotal is the VAT-inclusive amount →
 *   VAT is carved OUT of it, grand = lineTotal.
 * Reports must use this (not ad-hoc addition) or legacy totals inflate.
 */
export function purchaseLineAmounts(
  line: { vatAmount: DecimalLike | null; lineTotal: DecimalLike },
  zeroRated: boolean
): VatAmounts {
  const lineTotal = new Decimal(line.lineTotal.toString())
  if (line.vatAmount !== null && line.vatAmount !== undefined) {
    const vat = new Decimal(line.vatAmount.toString())
    return { subTotal: lineTotal, vat, grandTotal: lineTotal.plus(vat) }
  }
  if (zeroRated) return { subTotal: lineTotal, vat: new Decimal(0), grandTotal: lineTotal }
  const subTotal = lineTotal.div(VAT_DIVISOR).toDecimalPlaces(2)
  return { subTotal, vat: lineTotal.minus(subTotal), grandTotal: lineTotal }
}

/** Header-level equivalent of purchaseLineAmounts (totalAmount era split). */
export function purchaseHeaderAmounts(
  purchase: { vatAmount: DecimalLike | null; totalAmount: DecimalLike },
  zeroRated: boolean
): VatAmounts {
  const total = new Decimal(purchase.totalAmount.toString())
  if (purchase.vatAmount !== null && purchase.vatAmount !== undefined) {
    const vat = new Decimal(purchase.vatAmount.toString())
    return { subTotal: total.minus(vat), vat, grandTotal: total }
  }
  if (zeroRated) return { subTotal: total, vat: new Decimal(0), grandTotal: total }
  const subTotal = total.div(VAT_DIVISOR).toDecimalPlaces(2)
  return { subTotal, vat: total.minus(subTotal), grandTotal: total }
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
