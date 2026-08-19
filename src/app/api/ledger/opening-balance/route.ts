import { NextRequest, NextResponse } from 'next/server'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { OpeningBalanceInputSchema } from '@/lib/schemas/ledger'
import {
  postOpeningBalanceOnce, hasOpeningBalance, OpeningBalanceAlreadyPostedError,
  LEDGER_ACCOUNTS, type OpeningBalanceLine,
} from '@/lib/services/ledgerService'
import { sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'

/** GET /api/ledger/opening-balance — whether one has already been posted. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  try {
    const posted = await runWithRequestTenant(req, () => hasOpeningBalance())
    return NextResponse.json({ posted })
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/opening-balance failed')
    return NextResponse.json({ error: 'Failed to check opening balance status' }, { status: 500 })
  }
}

const ASSET_FIELDS = ['cash', 'bank', 'loansReceivable', 'accountsReceivable', 'inventory', 'vatReceivable'] as const
const LIABILITY_FIELDS = ['accountsPayable', 'vatPayable', 'loansPayable'] as const

const ASSET_ACCOUNT_CODES: Record<(typeof ASSET_FIELDS)[number], string> = {
  cash: LEDGER_ACCOUNTS.CASH,
  bank: LEDGER_ACCOUNTS.BANK,
  loansReceivable: LEDGER_ACCOUNTS.LOANS_RECEIVABLE,
  accountsReceivable: LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE,
  inventory: LEDGER_ACCOUNTS.INVENTORY,
  vatReceivable: LEDGER_ACCOUNTS.VAT_RECEIVABLE,
}
const LIABILITY_ACCOUNT_CODES: Record<(typeof LIABILITY_FIELDS)[number], string> = {
  accountsPayable: LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE,
  vatPayable: LEDGER_ACCOUNTS.VAT_PAYABLE,
  loansPayable: LEDGER_ACCOUNTS.LOANS_PAYABLE,
}

/**
 * POST /api/ledger/opening-balance — the one-time, self-service way for the
 * owner to state real starting figures (cash, bank, inventory value,
 * outstanding loans/debts) when first using the ledger, instead of needing a
 * developer to run scripts/ledger-historical-backfill.ts by hand. Owner's
 * Equity is never entered directly — it's always the balancing plug (assets
 * minus liabilities), so the posted entry can never be unbalanced. Admin only.
 */
export async function POST(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const body = await req.json().catch(() => ({}))
  const parsed = OpeningBalanceInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const lines: OpeningBalanceLine[] = []
  let totalAssets = new Decimal(0)
  let totalLiabilities = new Decimal(0)

  for (const field of ASSET_FIELDS) {
    const amount = new Decimal(data[field] ?? '0')
    if (amount.isZero()) continue
    lines.push({ accountCode: ASSET_ACCOUNT_CODES[field], debit: amount })
    totalAssets = totalAssets.plus(amount)
  }
  for (const field of LIABILITY_FIELDS) {
    const amount = new Decimal(data[field] ?? '0')
    if (amount.isZero()) continue
    lines.push({ accountCode: LIABILITY_ACCOUNT_CODES[field], credit: amount })
    totalLiabilities = totalLiabilities.plus(amount)
  }

  if (lines.length === 0) {
    return NextResponse.json({ error: 'Enter at least one opening balance figure' }, { status: 400 })
  }

  const equity = totalAssets.minus(totalLiabilities)
  if (equity.isPositive()) {
    lines.push({ accountCode: LEDGER_ACCOUNTS.OWNERS_EQUITY, credit: equity })
  } else if (equity.isNegative()) {
    lines.push({ accountCode: LEDGER_ACCOUNTS.OWNERS_EQUITY, debit: equity.abs() })
  }

  try {
    await runWithRequestTenant(req, () =>
      postOpeningBalanceOnce({
        entryDate: sastDateLabelToUTCDate(data.date),
        lines,
        userId: session.user.id,
      })
    )
    return NextResponse.json({ ok: true, totalAssets: totalAssets.toFixed(2), totalLiabilities: totalLiabilities.toFixed(2), equity: equity.toFixed(2) })
  } catch (err) {
    if (err instanceof OpeningBalanceAlreadyPostedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/ledger/opening-balance failed')
    return NextResponse.json({ error: 'Failed to post opening balance' }, { status: 500 })
  }
}
