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
  productCode?: string
  productName: string
  qty:         number   // nett quantity
  unitPrice:   string   // Decimal string
  lineTotal:   string   // Decimal string
  grossQty?:   number
  tareQty?:    number
}

export interface PurchaseReceiptData {
  refNumber:         string
  customerCode?:     string
  customerName:      string
  customerIdNo?:     string
  customerVatNumber?: string
  lines:             ReceiptLine[]
  totalAmount:       string   // VAT-inclusive grand total
  subtotalAmount?:   string   // pre-VAT
  vatAmount?:        string
  vatRatePct?:       string   // e.g. '15'
  paymentMethod:     string
  cashierName:       string   // "Done By"
  scaleOpName?:      string
  createdAt:         Date
  status:            'completed' | 'partial' | 'pending' | 'voided'
  slipNo?:           string
  splitPayments?: {
    cash:   string
    eft:    string
    cheque: string
    loan:   string
  }
  companyName?:      string
  companyAddress?:   string
  companyPhone?:     string
  companyVatNumber?: string
}

export interface SaleReceiptData {
  refNumber:     string
  buyerName?:    string
  buyerIdNumber?: string
  lines:         ReceiptLine[]
  totalAmount:   string
  paymentMethod: string
  cashierName:   string
  createdAt:     Date
}

const RECEIPT_WIDTH = 42

const STATUS_LABEL: Record<PurchaseReceiptData['status'], string> = {
  completed: 'PAID',
  partial:   'PARTIAL',
  pending:   'UNPAID',
  voided:    'VOIDED',
}

function formatSlipDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Greedy word-wrap for printing free text on a fixed-width thermal line. */
function wrapText(text: string, width: number): string[] {
  const words = text.split(' ')
  const out: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > width) {
      if (line) out.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out
}

// ─── Shared header / footer helpers (used by buildSaleReceipt) ──────────────
function addHeader(printer: ThermalPrinter, title: string, refNumber: string, date: Date) {
  printer.alignCenter()
  printer.bold(true)
  printer.println('GOLDEN KEY INVESTMENTS (PTY) LTD')
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

function addFooter(printer: ThermalPrinter, cashierName: string) {
  printer.drawLine()
  printer.alignCenter()
  printer.println(`Cashier: ${cashierName}`)
  printer.println('Thank you for your business!')
  printer.cut()
}

// ─── Public API ───────────────────────────────────────────────────────────────

function newPrinter(): ThermalPrinter {
  return new ThermalPrinter({
    type:         PrinterTypes.EPSON,
    interface:    'buffer',   // not sending to a device — just building the ESC/POS buffer
    characterSet: CharacterSet.PC850_MULTILINGUAL,
    removeSpecialCharacters: false,
    lineCharacter: '-',
  })
}

/**
 * Build a Buffer containing the ESC/POS bytes for a purchase receipt.
 * Layout mirrors the yard's paper weighbridge slip: status, company header,
 * PN No/date, done-by/scale-op, customer, weighed line items (gross/tare/nett),
 * totals, payment split, slip number and the ownership declaration.
 * Does NOT send to printer — caller decides transport.
 */
export async function buildPurchaseReceipt(data: PurchaseReceiptData): Promise<Buffer> {
  const printer = newPrinter()
  const companyName = data.companyName || 'Golden Key Investments (Pty) Ltd'

  // ── Status + company header ────────────────────────────────────────────
  printer.alignCenter()
  printer.bold(true)
  printer.println(STATUS_LABEL[data.status])
  printer.println(companyName.toUpperCase())
  printer.bold(false)
  printer.alignLeft()

  printer.leftRight('PN No:', data.refNumber)
  printer.println(`Date: ${formatSlipDate(data.createdAt)}`)
  printer.drawLine()

  // ── Company details ────────────────────────────────────────────────────
  if (data.companyAddress) {
    for (const addrLine of data.companyAddress.split(',')) printer.println(addrLine.trim())
  }
  if (data.companyPhone)      printer.println(`Tel: ${data.companyPhone}`)
  if (data.companyVatNumber)  printer.println(`Vat No.: ${data.companyVatNumber}`)
  printer.println(`Done By: ${data.cashierName}`)
  printer.println(`Scale Op: ${data.scaleOpName ?? data.cashierName}`)
  printer.drawLine()

  // ── Customer details ───────────────────────────────────────────────────
  const custLabel = data.customerCode ? `${data.customerCode}-${data.customerName}` : data.customerName
  printer.println(`Cust: ${custLabel}`)
  printer.println(`Cust VAT: ${data.customerVatNumber ?? ''}`)
  if (data.customerIdNo) printer.println(`ID: ${data.customerIdNo}`)
  printer.drawLine()

  // ── Weighed line items ─────────────────────────────────────────────────
  printer.bold(true)
  printer.tableCustom([
    { text: 'Product', align: 'LEFT',  width: 0.26 },
    { text: 'InPrice', align: 'RIGHT', width: 0.16 },
    { text: 'Gross',   align: 'RIGHT', width: 0.15 },
    { text: 'Tare',    align: 'RIGHT', width: 0.13 },
    { text: 'Nett',    align: 'RIGHT', width: 0.15 },
    { text: 'Total',   align: 'RIGHT', width: 0.15 },
  ])
  printer.bold(false)

  let nettTotalQty = new Decimal(0)
  for (const line of data.lines) {
    const nett  = new Decimal(line.qty)
    const gross = line.grossQty !== undefined ? new Decimal(line.grossQty) : nett
    const tare  = line.tareQty  !== undefined ? new Decimal(line.tareQty)  : new Decimal(0)
    nettTotalQty = nettTotalQty.plus(nett)

    printer.tableCustom([
      { text: (line.productCode ?? '').substring(0, 10),  align: 'LEFT',  width: 0.26 },
      { text: new Decimal(line.unitPrice).toFixed(2),      align: 'RIGHT', width: 0.16 },
      { text: gross.toFixed(1),                            align: 'RIGHT', width: 0.15 },
      { text: tare.toFixed(1),                             align: 'RIGHT', width: 0.13 },
      { text: nett.toFixed(1),                             align: 'RIGHT', width: 0.15 },
      { text: new Decimal(line.lineTotal).toFixed(2),       align: 'RIGHT', width: 0.15 },
    ])
    printer.println(`  ${line.productName.substring(0, 38)}`)
  }

  // ── Totals ──────────────────────────────────────────────────────────────
  const grandTotal = new Decimal(data.totalAmount)
  const subtotal   = data.subtotalAmount ? new Decimal(data.subtotalAmount) : grandTotal
  const vatAmt     = data.vatAmount ? new Decimal(data.vatAmount) : new Decimal(0)
  const vatPct     = data.vatRatePct ?? '15'

  printer.drawLine()
  printer.leftRight('Nett Total', nettTotalQty.toFixed(2))
  printer.leftRight('Total', `E ${subtotal.toFixed(2)}`)
  printer.leftRight(`${vatPct}% VAT`, `E ${vatAmt.toFixed(2)}`)
  printer.bold(true)
  printer.leftRight('Grand Total', `E ${grandTotal.toFixed(2)}`)
  printer.bold(false)

  // ── Payment split ───────────────────────────────────────────────────────
  const split = data.splitPayments
  const cashAmt   = new Decimal(split?.cash   || '0')
  const eftAmt    = new Decimal(split?.eft    || '0')
  const chequeAmt = new Decimal(split?.cheque || '0')
  const loanAmt   = new Decimal(split?.loan   || '0')
  const hasSplit  = cashAmt.greaterThan(0) || eftAmt.greaterThan(0) || chequeAmt.greaterThan(0) || loanAmt.greaterThan(0)

  printer.drawLine()
  printer.bold(true)
  printer.println('Payment Split:')
  printer.bold(false)
  if (hasSplit) {
    if (cashAmt.greaterThan(0))   printer.leftRight('Cash:',   `E ${cashAmt.toFixed(2)}`)
    if (eftAmt.greaterThan(0))    printer.leftRight('EFT:',    `E ${eftAmt.toFixed(2)}`)
    if (chequeAmt.greaterThan(0)) printer.leftRight('Cheque:', `E ${chequeAmt.toFixed(2)}`)
    if (loanAmt.greaterThan(0))   printer.leftRight('Loans:',  `E ${loanAmt.toFixed(2)}`)
  } else {
    printer.leftRight(`${data.paymentMethod.charAt(0).toUpperCase()}${data.paymentMethod.slice(1)}:`, `E ${grandTotal.toFixed(2)}`)
  }

  // ── Slip number ─────────────────────────────────────────────────────────
  if (data.slipNo) {
    printer.newLine()
    printer.println(`Slip No. ${data.slipNo}`)
  }

  // ── Ownership declaration ──────────────────────────────────────────────
  printer.newLine()
  const declaration = `I hereby state that I am the lawful owner of the material listed above and have sold them to ${companyName} to dispose of as I see fit.`
  for (const wrapped of wrapText(declaration, RECEIPT_WIDTH)) printer.println(wrapped)

  printer.newLine()
  printer.alignCenter()
  printer.println('Thank you for your business!')
  printer.cut()

  return Buffer.from(printer.getBuffer())
}

/**
 * Build a Buffer containing the ESC/POS bytes for a sale receipt.
 */
export async function buildSaleReceipt(data: SaleReceiptData): Promise<Buffer> {
  const printer = newPrinter()

  addHeader(printer, 'SALES RECEIPT', data.refNumber, data.createdAt)

  if (data.buyerName)     printer.println(`Buyer: ${data.buyerName}`)
  if (data.buyerIdNumber) printer.println(`ID: ${data.buyerIdNumber}`)
  printer.newLine()

  addLines(printer, data.lines)
  addTotal(printer, data.totalAmount, data.paymentMethod)
  addFooter(printer, data.cashierName)

  return Buffer.from(printer.getBuffer())
}
