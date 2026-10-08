// Minimal streaming ZIP writer using the STORE method (no compression).
//
// Built for bundling receipts (JPEG/PNG/PDF), which are already compressed,
// so deflate would burn CPU for ~no size gain. Writing it here avoids a new
// dependency. Emits one entry at a time so memory stays at roughly one file
// regardless of how many are bundled.
//
// Limits (classic ZIP, no ZIP64): < 65,535 entries and < 4 GiB total. Both
// are far beyond a month of receipts; exceeding either throws rather than
// producing a corrupt archive.

export interface ZipEntry {
  name: string
  data: Uint8Array
  modified: Date
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getUTCFullYear(), 1980), 2107)
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}

const UTF8_FLAG = 0x0800
const MAX_U32 = 0xffffffff
const MAX_ENTRIES = 0xffff

interface CentralRecord {
  nameBytes: Uint8Array
  crc: number
  size: number
  offset: number
  time: number
  date: number
}

function localHeader(rec: CentralRecord): Uint8Array {
  const buf = new Uint8Array(30 + rec.nameBytes.length)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x04034b50, true)
  v.setUint16(4, 20, true)           // version needed
  v.setUint16(6, UTF8_FLAG, true)    // flags
  v.setUint16(8, 0, true)            // method: store
  v.setUint16(10, rec.time, true)
  v.setUint16(12, rec.date, true)
  v.setUint32(14, rec.crc, true)
  v.setUint32(18, rec.size, true)    // compressed size
  v.setUint32(22, rec.size, true)    // uncompressed size
  v.setUint16(26, rec.nameBytes.length, true)
  v.setUint16(28, 0, true)           // extra length
  buf.set(rec.nameBytes, 30)
  return buf
}

function centralHeader(rec: CentralRecord): Uint8Array {
  const buf = new Uint8Array(46 + rec.nameBytes.length)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x02014b50, true)
  v.setUint16(4, 20, true)           // version made by
  v.setUint16(6, 20, true)           // version needed
  v.setUint16(8, UTF8_FLAG, true)
  v.setUint16(10, 0, true)           // method: store
  v.setUint16(12, rec.time, true)
  v.setUint16(14, rec.date, true)
  v.setUint32(16, rec.crc, true)
  v.setUint32(20, rec.size, true)
  v.setUint32(24, rec.size, true)
  v.setUint16(28, rec.nameBytes.length, true)
  // 30 extra, 32 comment, 34 disk, 36 internal attrs, 38 external attrs: all 0
  v.setUint32(42, rec.offset, true)
  buf.set(rec.nameBytes, 46)
  return buf
}

function endOfCentralDirectory(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const buf = new Uint8Array(22)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x06054b50, true)
  v.setUint16(8, count, true)
  v.setUint16(10, count, true)
  v.setUint32(12, cdSize, true)
  v.setUint32(16, cdOffset, true)
  return buf
}

/**
 * Streams a ZIP archive built from `entries`, pulling the next entry only
 * when the consumer is ready for more bytes.
 */
export function createZipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const iterator = entries[Symbol.asyncIterator]()
  const central: CentralRecord[] = []
  let offset = 0
  let finished = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (finished) return
        const next = await iterator.next()
        if (next.done) {
          let cdSize = 0
          const cdOffset = offset
          for (const rec of central) {
            const header = centralHeader(rec)
            controller.enqueue(header)
            cdSize += header.length
          }
          controller.enqueue(endOfCentralDirectory(central.length, cdSize, cdOffset))
          finished = true
          controller.close()
          return
        }
        const { name, data, modified } = next.value
        if (central.length >= MAX_ENTRIES) throw new Error('ZIP entry limit exceeded')
        const { time, date } = dosDateTime(modified)
        const rec: CentralRecord = {
          nameBytes: encoder.encode(name),
          crc: crc32(data),
          size: data.length,
          offset,
          time,
          date,
        }
        const header = localHeader(rec)
        if (offset + header.length + data.length > MAX_U32) throw new Error('ZIP size limit exceeded')
        controller.enqueue(header)
        controller.enqueue(data)
        offset += header.length + data.length
        central.push(rec)
      } catch (err) {
        finished = true
        controller.error(err)
      }
    },
    async cancel() {
      finished = true
      await iterator.return?.()
    },
  })
}
