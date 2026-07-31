/**
 * Thermal receipt formatter — produces an ESC/POS-compatible text buffer.
 * Returns a Buffer that can be sent directly to a network or USB printer.
 *
 * node-thermal-printer is used server-side only (API route / server action).
 */
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ReceiptLine {
  productName: string
  qty:         number
  unitPrice:   string   // Decimal string
  lineTotal:   string   // Decimal string
}

export interface PurchaseReceiptData {
  companyName?:  string
  refNumber:     string
  customerName:  string
  customerIdNo?: string
  lines:         ReceiptLine[]
  totalAmount:   string
  paymentMethod: string
  cashierName:   string
  createdAt:     Date
  splitPayments?: {
    cash:   string
    eft:    string
    cheque: string
    loan:   string
  }
}

export interface SaleReceiptData {
  companyName?:  string
  refNumber:     string
  buyerName?:    string
  buyerIdNumber?: string
  lines:         ReceiptLine[]
  totalAmount:   string
  paymentMethod: string
  cashierName:   string
  createdAt:     Date
}

// ─── Shared header / footer helpers ──────────────────────────────────────────
function addHeader(printer: ThermalPrinter, title: string, refNumber: string, date: Date, companyName?: string) {
  printer.alignCenter()
  printer.bold(true)
  printer.println((companyName || 'GOLDEN KEY INVESTMENTS (PTY) LTD').toUpperCase())
  printer.bold(false)
  printer.println('Renovo Pro')
  printer.drawLine()
  printer.bold(true)
  printer.println(title)
  printer.bold(false)
  printer.println(`Ref: ${refNumber}`)
  printer.println(date.toLocaleString('en-ZA'))
  printer.drawLine()
  printer.alignLeft()
}

function addLines(printer: ThermalPrinter, lines: ReceiptLine[]) {
  printer.bold(true)
  printer.tableCustom([
    { text: 'Item',  align: 'LEFT',  width: 0.50 },
    { text: 'Qty',   align: 'RIGHT', width: 0.10 },
    { text: 'Price', align: 'RIGHT', width: 0.20 },
    { text: 'Total', align: 'RIGHT', width: 0.20 },
  ])
  printer.bold(false)

  for (const line of lines) {
    printer.tableCustom([
      { text: line.productName.substring(0, 22), align: 'LEFT',  width: 0.50 },
      { text: String(line.qty),                  align: 'RIGHT', width: 0.10 },
      { text: `R${new Decimal(line.unitPrice).toFixed(2)}`, align: 'RIGHT', width: 0.20 },
      { text: `R${new Decimal(line.lineTotal).toFixed(2)}`, align: 'RIGHT', width: 0.20 },
    ])
  }
}

function addTotal(printer: ThermalPrinter, totalAmount: string, paymentMethod: string) {
  printer.drawLine()
  printer.bold(true)
  printer.leftRight('TOTAL', `R ${new Decimal(totalAmount).toFixed(2)}`)
  printer.bold(false)
  printer.leftRight('Payment', paymentMethod.toUpperCase())
}

function addSplitPayments(
  printer: ThermalPrinter,
  splitPayments: { cash: string; eft: string; cheque: string; loan: string }
) {
  const cashAmt   = new Decimal(splitPayments.cash   || '0')
  const eftAmt    = new Decimal(splitPayments.eft    || '0')
  const chequeAmt = new Decimal(splitPayments.cheque || '0')
  const loanAmt   = new Decimal(splitPayments.loan   || '0')

  // Only show if at least one method has an amount
  const hasAny = cashAmt.greaterThan(0) || eftAmt.greaterThan(0) ||
                 chequeAmt.greaterThan(0) || loanAmt.greaterThan(0)
  if (!hasAny) return

  printer.drawLine()
  printer.bold(true)
  printer.println('PAYMENT BREAKDOWN')
  printer.bold(false)

  if (cashAmt.greaterThan(0)) {
    printer.leftRight('Cash', `R ${cashAmt.toFixed(2)}`)
  }
  if (eftAmt.greaterThan(0)) {
    printer.leftRight('EFT', `R ${eftAmt.toFixed(2)}`)
  }
  if (chequeAmt.greaterThan(0)) {
    printer.leftRight('Cheque', `R ${chequeAmt.toFixed(2)}`)
  }
  if (loanAmt.greaterThan(0)) {
    printer.leftRight('Loan Deduction', `R ${loanAmt.toFixed(2)}`)
  }
}

function addFooter(printer: ThermalPrinter, cashierName: string) {
  printer.drawLine()
  printer.alignCenter()
  printer.println(`Cashier: ${cashierName}`)
  printer.println('Thank you for your business!')
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

  addHeader(printer, 'PURCHASE RECEIPT', data.refNumber, data.createdAt, data.companyName)

  printer.println(`Supplier: ${data.customerName}`)
  if (data.customerIdNo) printer.println(`ID: ${data.customerIdNo}`)
  printer.newLine()

  addLines(printer, data.lines)
  addTotal(printer, data.totalAmount, data.paymentMethod)
  if (data.splitPayments) {
    addSplitPayments(printer, data.splitPayments)
  }
  addFooter(printer, data.cashierName)

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

  addHeader(printer, 'SALES RECEIPT', data.refNumber, data.createdAt, data.companyName)

  if (data.buyerName)     printer.println(`Buyer: ${data.buyerName}`)
  if (data.buyerIdNumber) printer.println(`ID: ${data.buyerIdNumber}`)
  printer.newLine()

  addLines(printer, data.lines)
  addTotal(printer, data.totalAmount, data.paymentMethod)
  addFooter(printer, data.cashierName)

  return Buffer.from(printer.getBuffer())
}
