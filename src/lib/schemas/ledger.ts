import { z } from 'zod'

const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount')
  .optional()

// One row per real balance-sheet account the owner can state a starting
// figure for — Owner's Equity is deliberately excluded here: it's always
// computed as the balancing plug (assets minus liabilities) rather than
// entered directly, so the entry can never be submitted unbalanced.
export const OpeningBalanceInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  cash:               moneyString,
  bank:               moneyString,
  loansReceivable:    moneyString,
  accountsReceivable: moneyString,
  inventory:          moneyString,
  vatReceivable:      moneyString,
  accountsPayable:    moneyString,
  vatPayable:         moneyString,
  loansPayable:       moneyString,
})

export type OpeningBalanceInput = z.infer<typeof OpeningBalanceInputSchema>
