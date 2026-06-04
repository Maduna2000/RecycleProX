// ESC/POS byte generator for 58mm thermal printers.
// Pure TypeScript — zero dependencies. Identical to web app version.

const ESC = 0x1b
const GS  = 0x1d
const LF  = 0x0a

const CMD_INIT        = [ESC, 0x40]
const CMD_ALIGN_L     = [ESC, 0x61, 0x00]
const CMD_ALIGN_C     = [ESC, 0x61, 0x01]
const CMD_BOLD_ON     = [ESC, 0x45, 0x01]
const CMD_BOLD_OFF    = [ESC, 0x45, 0x00]
const CMD_SIZE_NORMAL = [GS,  0x21, 0x00]
const CMD_SIZE_BIG    = [GS,  0x21, 0x11]
const CMD_FEED        = [ESC, 0x64, 0x04]
const CMD_CUT         = [GS,  0x56, 0x42, 0x32]

const COLS = 32

function enc(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out.push(c < 128 ? c : 0x3f)
  }
  return out
}

function textLine(s: string): number[] {
  return [...enc(s.slice(0, COLS)), LF]
}

function emptyLine(): number[] { return [LF] }

function separator(char = '-'): number[] {
  return textLine(char.repeat(COLS))
}

function centred(s: string): string {
  if (s.length >= COLS) return s.slice(0, COLS)
  const p = Math.floor((COLS - s.length) / 2)
  return ' '.repeat(p) + s
}

function twoCol(left: string, right: string): number[] {
  const maxL = COLS - right.length - 1
  const l    = left.length > maxL ? left.slice(0, maxL - 1) + '…' : left
  const gap  = COLS - l.length - right.length
  return textLine(l + ' '.repeat(Math.max(1, gap)) + right)
}

export interface ReceiptData {
  orderNumber: string
  createdAt:   string
  customer: {
    firstName: string
    lastName:  string
    phone?:    string
    idNumber?: string
    isAccount: boolean
  }
  lines: {
    productName:  string
    categoryName?: string
    weight:       string
    unit:         string
  }[]
}

export function buildReceipt(data: ReceiptData): number[] {
  const buf: number[] = []
  const add = (...chunks: number[][]) => chunks.forEach(c => buf.push(...c))

  const date    = new Date(data.createdAt)
  const dateStr = date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })

  add(CMD_INIT)

  add(CMD_ALIGN_C)
  add(CMD_BOLD_ON, CMD_SIZE_BIG)
  add(textLine(centred('SCALE STATION')))
  add(CMD_SIZE_NORMAL)
  add(textLine(centred('Renovo Pro')))
  add(CMD_BOLD_OFF)
  add(emptyLine())
  add(separator('='))

  add(CMD_ALIGN_L)
  add(CMD_BOLD_ON)
  add(textLine(`Order: ${data.orderNumber}`))
  add(CMD_BOLD_OFF)
  add(textLine(`Date:  ${dateStr}  ${timeStr}`))
  add(emptyLine())

  add(separator('-'))
  add(CMD_BOLD_ON)
  add(textLine('CUSTOMER'))
  add(CMD_BOLD_OFF)
  add(textLine(`${data.customer.firstName} ${data.customer.lastName}`))
  if (data.customer.phone) {
    add(textLine(`Tel: ${data.customer.phone}`))
  }
  if (data.customer.idNumber) {
    add(textLine(`ID:  ${data.customer.idNumber}`))
  }
  add(textLine(`Type: ${data.customer.isAccount ? 'Account' : 'Walk-in'}`))
  add(emptyLine())

  add(separator('-'))
  add(CMD_BOLD_ON)
  add(textLine(`ITEMS (${data.lines.length})`))
  add(CMD_BOLD_OFF)

  data.lines.forEach((item, i) => {
    add(separator('-'))
    add(CMD_BOLD_ON)
    add(textLine(`${i + 1}. ${item.productName}`))
    add(CMD_BOLD_OFF)
    if (item.categoryName) {
      add(textLine(`   ${item.categoryName}`))
    }
    add(twoCol('   Weight:', `${parseFloat(item.weight).toFixed(3)} ${item.unit}`))
  })

  add(emptyLine())
  add(separator('='))
  add(CMD_ALIGN_C)
  add(CMD_BOLD_ON)
  add(textLine(centred('NO PRICE ON THIS SLIP')))
  add(CMD_BOLD_OFF)
  add(separator('='))
  add(emptyLine())
  add(textLine(centred('Thank you!')))
  add(emptyLine())

  add(CMD_FEED)
  add(CMD_CUT)

  return buf
}
