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
  refNumber:     string
  customerName:  string
  customerIdNo?: string
  lines:         ReceiptLine[]
  totalAmount:   string
  paymentMethod: string
  cashierName:   string
  createdAt:     Date
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

// ─── Shared header / footer helpers ──────────────────────────────────────────
function addHeader(printer: ThermalPrinter, title: string, refNumber: string, date: Date) {
  printer.alignCenter()
  printer.bold(true)
  printer.println('LARIAT TECHNOLOGIES')
  printer.bold(false)
  printer.println('RecycleProX Recycling Yard')
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
  printer.println('www.lariat.co.za')
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

  addHeader(printer, 'PURCHASE RECEIPT', data.refNumber, data.createdAt)

  printer.println(`Supplier: ${data.customerName}`)
  if (data.customerIdNo) printer.println(`ID: ${data.customerIdNo}`)
  printer.newLine()

  addLines(printer, data.lines)
  addTotal(printer, data.totalAmount, data.paymentMethod)
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

  addHeader(printer, 'SALES RECEIPT', data.refNumber, data.createdAt)

  if (data.buyerName)     printer.println(`Buyer: ${data.buyerName}`)
  if (data.buyerIdNumber) printer.println(`ID: ${data.buyerIdNumber}`)
  printer.newLine()

  addLines(printer, data.lines)
  addTotal(printer, data.totalAmount, data.paymentMethod)
  addFooter(printer, data.cashierName)

  return Buffer.from(printer.getBuffer())
}
