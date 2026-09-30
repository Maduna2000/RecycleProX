import { describe, it, expect } from 'vitest'
import { CreateSaleSchema } from '@/lib/schemas/sale'
import { CreatePurchaseSchema } from '@/lib/schemas/purchase'
import { zodErrorMessage } from '@/lib/utils/zodError'
import { apiErrorMessage } from '@/lib/utils/apiError'

const uuid = '3f1c2b9e-6a52-4c39-9a36-0c6c3f2f7a11'

describe('zodErrorMessage', () => {
  it('names the line, field and rule for a 3-decimal sale price', () => {
    const r = CreateSaleSchema.safeParse({
      buyerName: 'Buyer',
      lines: [{ productId: uuid, quantity: '1', unitPrice: '10.00' }, { productId: uuid, quantity: '1', unitPrice: '227.240' }],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(zodErrorMessage(r.error)).toBe('Line 2 – Unit price: Price can have at most 2 decimal places (e.g. 227.24)')
    }
  })
  it('does the same for a purchase line', () => {
    const r = CreatePurchaseSchema.safeParse({
      customerId: uuid,
      lines: [{ productId: uuid, quantity: '2', unitPrice: '227.240' }],
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(zodErrorMessage(r.error)).toContain('Line 1 – Unit price: Price can have at most 2 decimal places')
  })
})

describe('apiErrorMessage', () => {
  it('passes strings through', () => expect(apiErrorMessage('Nope', 'x')).toBe('Nope'))
  it('flattens a Zod flatten() object instead of "[object Object]"', () => {
    const msg = apiErrorMessage({ formErrors: [], fieldErrors: { lines: ['Must be a valid price'] } }, 'x')
    expect(msg).toBe('lines: Must be a valid price')
    expect(msg).not.toContain('[object Object]')
  })
  it('falls back for unknown shapes', () => expect(apiErrorMessage({}, 'Fallback')).toBe('Fallback'))
})
