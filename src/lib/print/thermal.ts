/**
 * Thermal receipt formatter — produces an ESC/POS-compatible text buffer.
 * Returns a Buffer that can be sent directly to a network or USB printer.
 *
 * Layout matches the legacy paper receipt field-for-field (address/VAT
 * block, Done By/Scale Op/Rep, Gross/Tare/Nett table, Slip No., and a
 * settings-driven legal declaration footer) — see
 * docs/plans/2026-08-01-desktop-hybrid-sync-design.md.
 *
 * node-thermal-printer is used server-side only (API route / server action).
 */
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ReceiptLine {
  productCode?: string
  productName: string
  qty:         number       // net quantity
  unitPrice:   string       // Decimal string ("InPrice" on the legacy slip)
  lineTotal:   string       // Decimal string
  grossQty?:   string
  tareQty?:    string
}

interface CompanyInfo {
  companyName?:    string
  companyAddress?: string
  companyPhone?:   string
  vatNumber?:      string
}

export interface PurchaseReceiptData extends CompanyInfo {
  refNumber:     string
  slipNo?:       string | number
  // Drives the "PAID"/"UNPAID" banner at the top — a pending (not yet
  // settled) purchase must never print as PAID.
  status:        'completed' | 'pending' | 'voided'
  customerCode?: string
  customerName:  string
  customerIdNo?: string
  customerPhone?: string
  customerVatNumber?: string
  lines:         ReceiptLine[]
  totalAmount:   string
  vatAmount?:    string
  paymentMethod: string
  cashierName:   string
  // Only set when this purchase came through the Scale Station queue-number
  // flow (purchase.scaleOrderId set) — omitted entirely otherwise, never
  // repeated from cashierName/"Done By".
  scaleOperatorName?: string
  createdAt:     Date
  // Set when printed from the offline queue, before the server has assigned
  // a permanent reference number — see src/app/api/print/slip/route.ts's
  // data-based (no DB id) branch and src/lib/offline/sync.ts's reconciliation.
  provisional?:  boolean
  // From SystemSettings.purchaseNoteDeclaration — never hardcoded here.
  footerText?:   string
  loanDeduction?: { amount: string; reference?: string }
  splitPayments?: {
    cash:   string
    eft:    string
    cheque: string
    loan:   string
  }
}

export interface SaleReceiptData extends CompanyInfo {
  refNumber:     string
  slipNo?:       string | number
  // Drives the "PAID"/"UNPAID" banner at the top, same as purchases — a
  // pending (not yet settled) sale must never print as PAID.
  status:        'completed' | 'pending' | 'voided'
  buyerCode?:    string
  buyerName?:    string
  buyerIdNumber?: string
  buyerPhone?:   string
  buyerVatNumber?: string
  lines:         ReceiptLine[]
  totalAmount:   string
  vatAmount?:    string
  paymentMethod: string
  cashierName:   string
  createdAt:     Date
  provisional?:  boolean
  // From SystemSettings.saleNoteDeclaration — never hardcoded here.
  footerText?:   string
  businessLoanDeduction?: { amount: string }
  splitPayments?: {
    cash:         string
    eft:          string
    businessLoan: string
  }
}

// ─── Shared header / footer helpers ──────────────────────────────────────────

// Splits a free-text address setting ("Portion 3, Lot no:443, Matsapha
// Industrial Site, Manzini, Eswatini") onto its own line per comma-separated
// segment, matching the legacy slip's multi-line address block.
function printAddressLines(printer: ThermalPrinter, address?: string) {
  if (!address) return
  for (const segment of address.split(',').map((s) => s.trim()).filter(Boolean)) {
    printer.println(segment)
  }
}

function addHeader(printer: ThermalPrinter, refNumber: string, date: Date, info: CompanyInfo, provisional?: boolean, statusLabel = 'PAID') {
  printer.alignCenter()
  printer.bold(true)
  printer.println(statusLabel)
  printer.println((info.companyName || 'GOLDEN KEY INVESTMENTS (PTY) LTD').toUpperCase())
  printer.bold(false)
  printer.alignLeft()
  printer.println(`PN No: ${refNumber}`)
  printer.println(`Date: ${date.toLocaleString('en-ZA')}`)
  printer.newLine()
  printAddressLines(printer, info.companyAddress)
  if (info.companyPhone) printer.println(`Tel: ${info.companyPhone}`)
  if (info.vatNumber)    printer.println(`VAT No.: ${info.vatNumber}`)
  if (provisional) {
    printer.bold(true)
    printer.println('*** PROVISIONAL - PENDING SYNC ***')
    printer.bold(false)
  }
  printer.drawLine()
}

function addPeopleLines(printer: ThermalPrinter, cashierName: string, scaleOperatorName?: string) {
  printer.println(`Done By: ${cashierName}`)
  if (scaleOperatorName) printer.println(`Scale Op: ${scaleOperatorName}`)
  printer.println('Rep:')
  printer.newLine()
}

function addPartyLines(printer: ThermalPrinter, label: string, code: string | undefined, name: string, vatNumber?: string) {
  const custLine = code ? `${code}-${name}` : name
  printer.println(`${label}: ${custLine}`)
  printer.println(`${label} VAT: ${vatNumber ?? ''}`)
  printer.newLine()
}

function addLines(printer: ThermalPrinter, lines: ReceiptLine[]) {
  printer.bold(true)
  printer.tableCustom([
    { text: 'Product', align: 'LEFT',  width: 0.22 },
    { text: 'InPrice', align: 'RIGHT', width: 0.16 },
    { text: 'Gross',   align: 'RIGHT', width: 0.14 },
    { text: 'Tare',    align: 'RIGHT', width: 0.12 },
    { text: 'Nett',    align: 'RIGHT', width: 0.14 },
    { text: 'Total',   align: 'RIGHT', width: 0.22 },
  ])
  printer.bold(false)

  for (const line of lines) {
    printer.tableCustom([
      { text: (line.productCode ?? '').substring(0, 10), align: 'LEFT',  width: 0.22 },
      { text: new Decimal(line.unitPrice).toFixed(2),    align: 'RIGHT', width: 0.16 },
      { text: line.grossQty ?? '',                       align: 'RIGHT', width: 0.14 },
      { text: line.tareQty ?? '0',                        align: 'RIGHT', width: 0.12 },
      { text: String(line.qty),                          align: 'RIGHT', width: 0.14 },
      { text: new Decimal(line.lineTotal).toFixed(2),    align: 'RIGHT', width: 0.22 },
    ])
    // Product name wraps to its own line below the code/numbers row,
    // matching the legacy slip's own wrapping (e.g. "08002" / "ally o/r").
    printer.println(` ${line.productName}`)
  }
}

function addTotals(printer: ThermalPrinter, lines: ReceiptLine[], totalAmount: string, vatAmount: string | undefined) {
  const nettTotal = lines.reduce((acc, l) => acc.plus(l.qty || 0), new Decimal(0))
  const total = new Decimal(totalAmount)
  const vat = new Decimal(vatAmount ?? '0')
  const grandTotal = total.plus(vat)

  printer.drawLine()
  printer.leftRight('Nett Total', nettTotal.toFixed(1))
  printer.leftRight('Total', `E ${total.toFixed(2)}`)
  printer.leftRight('15% VAT', `E ${vat.toFixed(2)}`)
  printer.bold(true)
  printer.leftRight('Grand Total', `E ${grandTotal.toFixed(2)}`)
  printer.bold(false)
}

function addSplitPayments(
  printer: ThermalPrinter,
  splitPayments: { cash: string; eft: string; cheque?: string; loan: string },
  // Sales use "Business Loan" (the reverse-direction feature, see
  // BusinessLoan) rather than purchases' "Loans" — kept distinct per
  // feedback_differentiate_mirrored_features rather than reusing one label.
  loanLabel: string = 'Loans',
  loanReference?: string,
) {
  const cashAmt   = new Decimal(splitPayments.cash   || '0')
  const eftAmt    = new Decimal(splitPayments.eft    || '0')
  const chequeAmt = new Decimal(splitPayments.cheque ?? '0')
  const loanAmt   = new Decimal(splitPayments.loan   || '0')

  const hasAny = cashAmt.greaterThan(0) || eftAmt.greaterThan(0) ||
                 chequeAmt.greaterThan(0) || loanAmt.greaterThan(0)
  if (!hasAny) return

  printer.newLine()
  printer.bold(true)
  printer.println('Payment Split:')
  printer.bold(false)

  if (cashAmt.greaterThan(0))   printer.leftRight('Cash', `E ${cashAmt.toFixed(2)}`)
  if (eftAmt.greaterThan(0))    printer.leftRight('EFT', `E ${eftAmt.toFixed(2)}`)
  if (chequeAmt.greaterThan(0)) printer.leftRight('Cheque', `E ${chequeAmt.toFixed(2)}`)
  if (loanAmt.greaterThan(0))   printer.leftRight(loanLabel, `E ${loanAmt.toFixed(2)}${loanReference ? ` #${loanReference}` : ''}`)
}

function addFooter(printer: ThermalPrinter, slipNo: string | number | undefined, footerText: string | undefined) {
  if (slipNo !== undefined) {
    printer.newLine()
    printer.println(`Slip No. ${slipNo}`)
  }
  printer.newLine()
  printer.alignLeft()
  if (footerText) printer.println(footerText)
  printer.drawLine()
  printer.cut()
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a Buffer containing the ESC/POS bytes for a purchase receipt.
 * Does NOT send to printer — caller decides transport.
 */
export async function buildPurchaseReceipt(data: PurchaseReceiptData): Promise<Buffer> {
  const printer = new ThermalPrinter({
    type:         PrinterTypes.EPSON,
    interface:    'buffer',   // not sending to a device — just building the ESC/POS buffer
    characterSet: CharacterSet.PC850_MULTILINGUAL,
    removeSpecialCharacters: false,
    lineCharacter: '-',
  })

  addHeader(printer, data.refNumber, data.createdAt, data, data.provisional, data.status === 'completed' ? 'PAID' : 'UNPAID')
  addPeopleLines(printer, data.cashierName, data.scaleOperatorName)
  addPartyLines(printer, 'Cust', data.customerCode, data.customerName, data.customerVatNumber)
  if (data.customerIdNo) printer.println(`ID: ${data.customerIdNo}`)
  if (data.customerPhone) printer.println(`Phone: ${data.customerPhone}`)

  addLines(printer, data.lines)
  addTotals(printer, data.lines, data.totalAmount, data.vatAmount)
  if (data.splitPayments) {
    addSplitPayments(printer, data.splitPayments, 'Loans', data.loanDeduction?.reference)
  } else if (data.loanDeduction && new Decimal(data.loanDeduction.amount).greaterThan(0)) {
    printer.newLine()
    printer.println('Payment Split:')
    printer.leftRight('Loans', `E ${new Decimal(data.loanDeduction.amount).toFixed(2)}${data.loanDeduction.reference ? ` #${data.loanDeduction.reference}` : ''}`)
  }
  addFooter(printer, data.slipNo, data.footerText)

  return Buffer.from(printer.getBuffer())
}

/**
 * Build a Buffer containing the ESC/POS bytes for a sale receipt.
 */
export async function buildSaleReceipt(data: SaleReceiptData): Promise<Buffer> {
  const printer = new ThermalPrinter({
    type:         PrinterTypes.EPSON,
    interface:    'buffer',   // not sending to a device — just building the ESC/POS buffer
    characterSet: CharacterSet.PC850_MULTILINGUAL,
    removeSpecialCharacters: false,
    lineCharacter: '-',
  })

  addHeader(printer, data.refNumber, data.createdAt, data, data.provisional, data.status === 'completed' ? 'PAID' : 'UNPAID')
  addPeopleLines(printer, data.cashierName)
  addPartyLines(printer, 'Buyer', data.buyerCode, data.buyerName ?? 'Walk-in Customer', data.buyerVatNumber)
  if (data.buyerIdNumber) printer.println(`ID: ${data.buyerIdNumber}`)
  if (data.buyerPhone)    printer.println(`Phone: ${data.buyerPhone}`)

  addLines(printer, data.lines)
  addTotals(printer, data.lines, data.totalAmount, data.vatAmount)
  if (data.splitPayments) {
    addSplitPayments(printer, { cash: data.splitPayments.cash, eft: data.splitPayments.eft, loan: data.splitPayments.businessLoan }, 'Business Loan')
  } else if (data.businessLoanDeduction && new Decimal(data.businessLoanDeduction.amount).greaterThan(0)) {
    printer.newLine()
    printer.println('Payment Split:')
    printer.leftRight('Business Loan', `E ${new Decimal(data.businessLoanDeduction.amount).toFixed(2)}`)
  }
  addFooter(printer, data.slipNo, data.footerText)

  return Buffer.from(printer.getBuffer())
}
