/**
 * Bulk expense-receipt download: the ZIP writer produces a valid archive,
 * files are named by SAST date + expense number, a receipt that can't be
 * fetched is flagged in the index instead of failing the download, and the
 * index CSV can't be used for spreadsheet formula injection.
 */

import { describe, it, expect } from 'vitest'
import { createZipStream, crc32 } from '@/lib/zip/storedZip'
import {
  buildIndexCsv,
  INDEX_FILE_NAME,
  receiptFileName,
  receiptZipEntries,
  type ReceiptExpenseRow,
} from '@/lib/services/expenseReceiptExport'

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

// Reads the archive back through its central directory, as an unzip tool would.
function readZip(buf: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const eocd = buf.length - 22
  expect(v.getUint32(eocd, true)).toBe(0x06054b50)
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const files: { name: string; data: Uint8Array; crc: number }[] = []
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const localOffset = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen))
    expect(v.getUint32(localOffset, true)).toBe(0x04034b50)
    const localNameLen = v.getUint16(localOffset + 26, true)
    const dataStart = localOffset + 30 + localNameLen
    files.push({ name, data: buf.subarray(dataStart, dataStart + size), crc })
    p += 46 + nameLen
  }
  return files
}

async function* gen<T>(items: T[]): AsyncGenerator<T> { for (const i of items) yield i }

describe('createZipStream', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('round-trips entries with correct names, bytes and checksums', async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5])
    const b = new TextEncoder().encode('receipt é')
    const zip = await collect(createZipStream(gen([
      { name: 'a.jpg', data: a, modified: new Date('2026-09-14T10:00:00Z') },
      { name: 'b café.pdf', data: b, modified: new Date('2026-09-15T10:00:00Z') },
    ])))
    const files = readZip(zip)
    expect(files.map((f) => f.name)).toEqual(['a.jpg', 'b café.pdf'])
    expect(Array.from(files[0]!.data)).toEqual([1, 2, 3, 4, 5])
    expect(files[1]!.data).toEqual(b)
    expect(files[0]!.crc).toBe(crc32(a))
  })

  it('produces a valid empty archive', async () => {
    const zip = await collect(createZipStream(gen([])))
    expect(zip.length).toBe(22)
  })
})

describe('receiptFileName', () => {
  const row = { refNumber: 'EXP-00188', createdAt: new Date('2026-09-14T22:30:00Z') } // 15 Sept 00:30 SAST

  it('uses the SAST date, not the UTC date', () => {
    expect(receiptFileName(row, { r2Key: 'expenses/x/attachments/u.jpg', fileName: 'IMG_1.JPG' }, 0, 1))
      .toBe('2026-09-15_EXP-00188_receipt.jpg')
  })

  it('numbers multiple receipts for one expense', () => {
    expect(receiptFileName(row, { r2Key: 'k.pdf', fileName: 'slip' }, 1, 3)).toBe('2026-09-15_EXP-00188_receipt_2.pdf')
  })

  it('falls back to bin and strips unsafe characters', () => {
    expect(receiptFileName({ ...row, refNumber: '../EXP 1' }, { r2Key: 'k', fileName: 'noext' }, 0, 1))
      .toBe('2026-09-15_EXP-1_receipt.bin')
  })
})

describe('buildIndexCsv', () => {
  it('neutralises formulas and quotes commas and quotes', () => {
    const csv = buildIndexCsv([{
      date: '2026-09-14', refNumber: 'EXP-1', type: 'fuel', description: '=HYPERLINK("x"),y',
      method: 'cash', amount: '10.00', vat: '0.00', file: 'f.jpg', status: 'INCLUDED',
    }])
    expect(csv).toContain(`"'=HYPERLINK(""x""),y"`)
  })
})

describe('receiptZipEntries', () => {
  const mk = (ref: string, day: string, keys: string[]): ReceiptExpenseRow => ({
    refNumber: ref, createdAt: new Date(day), description: 'd', amount: '100', vatAmount: '13.04',
    includesVat: false, paymentMethod: 'cash', expenseType: { name: 'fuel' },
    attachments: keys.map((k) => ({ r2Key: k, fileName: `${k}.jpg` })),
  })

  it('emits receipts in order, then an index; missing receipts are flagged, not fatal', async () => {
    const rows = [mk('EXP-1', '2026-09-01T08:00:00Z', ['a', 'b']), mk('EXP-2', '2026-09-02T08:00:00Z', ['c'])]
    const bytes: Record<string, Uint8Array | null> = { a: new Uint8Array([1]), b: null, c: new Uint8Array([3]) }
    const missing: string[] = []
    const out: string[] = []
    let index = ''
    for await (const e of receiptZipEntries(rows, async (k) => bytes[k] ?? null, (k) => missing.push(k))) {
      out.push(e.name)
      if (e.name === INDEX_FILE_NAME) index = new TextDecoder().decode(e.data)
    }
    expect(out).toEqual(['2026-09-01_EXP-1_receipt_1.jpg', '2026-09-02_EXP-2_receipt.jpg', INDEX_FILE_NAME])
    expect(missing).toEqual(['b'])
    expect(index).toContain('EXP-1,fuel,d,cash,100.00,0.00,2026-09-01_EXP-1_receipt_2.jpg,MISSING')
    expect(index).toContain('INCLUDED')
  })

  it('treats a fetch that throws as missing', async () => {
    const rows = [mk('EXP-1', '2026-09-01T08:00:00Z', ['a'])]
    const names: string[] = []
    for await (const e of receiptZipEntries(rows, async () => { throw new Error('boom') })) names.push(e.name)
    expect(names).toEqual([INDEX_FILE_NAME])
  })
})
