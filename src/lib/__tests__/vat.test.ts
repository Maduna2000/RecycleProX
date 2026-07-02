import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import {
  purchaseLineVat,
  purchaseHeaderVat,
  purchaseLineAmounts,
  purchaseHeaderAmounts,
  saleLineVat,
} from '@/lib/utils/vat'

const D = (s: string) => new Decimal(s)

describe('purchaseLineVat', () => {
  it('uses the persisted vatAmount when present', () => {
    expect(purchaseLineVat({ vatAmount: D('15.00'), lineTotal: D('100.00') }, false).toFixed(2)).toBe('15.00')
  })

  it('uses persisted zero (explicitly unticked line) even when not zero-rated', () => {
    expect(purchaseLineVat({ vatAmount: D('0.00'), lineTotal: D('100.00') }, false).toFixed(2)).toBe('0.00')
  })

  it('derives from an inclusive total for legacy rows (null vatAmount)', () => {
    // 115.00 inclusive → 100.00 net + 15.00 VAT
    expect(purchaseLineVat({ vatAmount: null, lineTotal: D('115.00') }, false).toFixed(2)).toBe('15.00')
  })

  it('returns zero for legacy rows of zero-rated customers', () => {
    expect(purchaseLineVat({ vatAmount: null, lineTotal: D('115.00') }, true).toFixed(2)).toBe('0.00')
  })

  it('persisted vatAmount wins over zeroRated flag (data is authoritative)', () => {
    expect(purchaseLineVat({ vatAmount: D('7.50'), lineTotal: D('57.50') }, true).toFixed(2)).toBe('7.50')
  })
})

describe('purchaseHeaderVat', () => {
  it('uses persisted header vatAmount when present', () => {
    expect(purchaseHeaderVat({ vatAmount: D('30.00'), totalAmount: D('230.00') }, false).toFixed(2)).toBe('30.00')
  })

  it('derives from inclusive totalAmount for legacy rows', () => {
    expect(purchaseHeaderVat({ vatAmount: null, totalAmount: D('230.00') }, false).toFixed(2)).toBe('30.00')
  })

  it('returns zero for zero-rated legacy rows', () => {
    expect(purchaseHeaderVat({ vatAmount: null, totalAmount: D('230.00') }, true).toFixed(2)).toBe('0.00')
  })
})

describe('purchaseLineAmounts (era split)', () => {
  it('new row: lineTotal is ex-VAT, VAT sits on top', () => {
    const a = purchaseLineAmounts({ vatAmount: D('15.00'), lineTotal: D('100.00') }, false)
    expect(a.subTotal.toFixed(2)).toBe('100.00')
    expect(a.vat.toFixed(2)).toBe('15.00')
    expect(a.grandTotal.toFixed(2)).toBe('115.00')
  })

  it('legacy row: lineTotal is inclusive, VAT carved out, grand = lineTotal', () => {
    const a = purchaseLineAmounts({ vatAmount: null, lineTotal: D('10.00') }, false)
    expect(a.subTotal.toFixed(2)).toBe('8.70')
    expect(a.vat.toFixed(2)).toBe('1.30')
    expect(a.grandTotal.toFixed(2)).toBe('10.00')
  })

  it('legacy zero-rated row: no VAT, grand = lineTotal', () => {
    const a = purchaseLineAmounts({ vatAmount: null, lineTotal: D('10.00') }, true)
    expect(a.subTotal.toFixed(2)).toBe('10.00')
    expect(a.vat.toFixed(2)).toBe('0.00')
    expect(a.grandTotal.toFixed(2)).toBe('10.00')
  })

  it('sub + vat always equals grand in both eras', () => {
    for (const line of [
      { vatAmount: D('7.53'), lineTotal: D('50.17') },
      { vatAmount: null, lineTotal: D('50.17') },
    ]) {
      const a = purchaseLineAmounts(line, false)
      expect(a.subTotal.plus(a.vat).toFixed(2)).toBe(a.grandTotal.toFixed(2))
    }
  })
})

describe('purchaseHeaderAmounts (era split)', () => {
  it('new header: totalAmount is inclusive with persisted VAT', () => {
    const a = purchaseHeaderAmounts({ vatAmount: D('30.00'), totalAmount: D('230.00') }, false)
    expect(a.subTotal.toFixed(2)).toBe('200.00')
    expect(a.grandTotal.toFixed(2)).toBe('230.00')
  })

  it('legacy header: VAT carved out of totalAmount', () => {
    const a = purchaseHeaderAmounts({ vatAmount: null, totalAmount: D('230.00') }, false)
    expect(a.subTotal.toFixed(2)).toBe('200.00')
    expect(a.vat.toFixed(2)).toBe('30.00')
    expect(a.grandTotal.toFixed(2)).toBe('230.00')
  })
})

describe('saleLineVat', () => {
  it('is lineTotal × 0.15 when the sale carried VAT', () => {
    expect(saleLineVat({ lineTotal: D('200.00') }, true).toFixed(2)).toBe('30.00')
  })

  it('is zero when the sale carried no VAT', () => {
    expect(saleLineVat({ lineTotal: D('200.00') }, false).toFixed(2)).toBe('0.00')
  })
})
