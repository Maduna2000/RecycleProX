import Decimal from 'decimal.js'
import { sastDayLabelOfInstant } from '@/lib/utils/dayBounds'
import type { ZipEntry } from '@/lib/zip/storedZip'

// Bulk download of expense receipts. Pure logic only (no HTTP, no DB): the
// route loads the rows, this module names the files, fetches the bytes and
// builds the index, so it can be tested without R2.

export interface ReceiptExpenseRow {
  refNumber: string
  createdAt: Date
  description: string
  amount: { toString(): string }
  vatAmount: { toString(): string }
  includesVat: boolean
  paymentMethod: string
  expenseType: { name: string }
  attachments: { r2Key: string; fileName: string }[]
}

export type FetchBytes = (key: string) => Promise<Uint8Array | null>

export const INDEX_FILE_NAME = '00_index.csv'
// Receipts fetched in parallel. Entries are still emitted in order.
const FETCH_AHEAD = 4

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'expense'
}

function extensionOf(fileName: string, r2Key: string): string {
  for (const source of [fileName, r2Key]) {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(source)
    if (m) return m[1]!.toLowerCase()
  }
  return 'bin'
}

export function receiptFileName(
  row: Pick<ReceiptExpenseRow, 'refNumber' | 'createdAt'>,
  attachment: { r2Key: string; fileName: string },
  index: number,
  total: number,
): string {
  const date = sastDayLabelOfInstant(row.createdAt)
  const suffix = total > 1 ? `_${index + 1}` : ''
  return `${date}_${safeSegment(row.refNumber)}_receipt${suffix}.${extensionOf(attachment.fileName, attachment.r2Key)}`
}

// Quotes a CSV cell and neutralises spreadsheet formula injection (a
// description such as "=HYPERLINK(...)" must not run when opened in Excel).
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

export interface IndexLine {
  date: string
  refNumber: string
  type: string
  description: string
  method: string
  amount: string
  vat: string
  file: string
  status: 'INCLUDED' | 'MISSING'
}

export function buildIndexCsv(lines: IndexLine[]): string {
  const header = ['Date', 'Expense No', 'Type', 'Description', 'Method', 'Amount', 'VAT', 'File', 'Status']
  const rows = lines.map((l) =>
    [l.date, l.refNumber, l.type, l.description, l.method, l.amount, l.vat, l.file, l.status].map(csvCell).join(','),
  )
  return [header.join(','), ...rows].join('\r\n') + '\r\n'
}

interface Planned {
  row: ReceiptExpenseRow
  name: string
  r2Key: string
}

export function planReceiptFiles(rows: ReceiptExpenseRow[]): Planned[] {
  const planned: Planned[] = []
  for (const row of rows) {
    row.attachments.forEach((a, i) => {
      planned.push({ row, name: receiptFileName(row, a, i, row.attachments.length), r2Key: a.r2Key })
    })
  }
  return planned
}

/**
 * Yields one ZIP entry per receipt (oldest expense first), then the index.
 * A receipt that can't be fetched is left out of the archive and flagged
 * MISSING in the index instead of failing the whole download.
 */
export async function* receiptZipEntries(
  rows: ReceiptExpenseRow[],
  fetchBytes: FetchBytes,
  onMissing?: (r2Key: string, expenseRef: string) => void,
): AsyncGenerator<ZipEntry> {
  const planned = planReceiptFiles(rows)
  const lines: IndexLine[] = []
  const inFlight: Promise<Uint8Array | null>[] = []
  let started = 0

  const start = () => {
    while (started < planned.length && inFlight.length < FETCH_AHEAD) {
      inFlight.push(fetchBytes(planned[started]!.r2Key).catch(() => null))
      started++
    }
  }

  start()
  for (const p of planned) {
    const data = await inFlight.shift()!
    start()
    const { row } = p
    const base = {
      date: sastDayLabelOfInstant(row.createdAt),
      refNumber: row.refNumber,
      type: row.expenseType.name,
      description: row.description,
      method: row.paymentMethod,
      amount: new Decimal(row.amount.toString()).toFixed(2),
      vat: row.includesVat ? new Decimal(row.vatAmount.toString()).toFixed(2) : '0.00',
      file: p.name,
    }
    if (data) {
      lines.push({ ...base, status: 'INCLUDED' })
      yield { name: p.name, data, modified: row.createdAt }
    } else {
      lines.push({ ...base, status: 'MISSING' })
      onMissing?.(p.r2Key, row.refNumber)
    }
  }

  yield {
    name: INDEX_FILE_NAME,
    // BOM so Excel reads the UTF-8 text correctly.
    data: new TextEncoder().encode('﻿' + buildIndexCsv(lines)),
    modified: new Date(),
  }
}
