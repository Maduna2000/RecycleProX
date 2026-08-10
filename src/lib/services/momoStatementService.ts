import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import Decimal from 'decimal.js'
import Papa from 'papaparse'
import logger from '@/lib/logger'
import { uploadBytes, momoStatementCsvKey } from '@/lib/r2'
import { sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'

export class MomoStatementEmptyError extends Error {
  constructor() { super('CSV file has no usable transaction rows'); this.name = 'MomoStatementEmptyError' }
}

export class MomoStatementNotFoundError extends Error {
  constructor(id: string) { super(`MoMo statement "${id}" not found`); this.name = 'MomoStatementNotFoundError' }
}

type MomoCsvRow = Record<string, string>

type ParsedLine = {
  externalTxnId:   string | null
  transactionDate: Date
  dateLabel:       string   // raw "YYYY-MM-DD" prefix, for picking the statement's calendar day
  status:          string
  type:            string
  fromName:        string | null
  toName:          string | null
  toMessage:       string | null
  amount:          Decimal
  fee:             Decimal
  balance:         Decimal | null
}

// The provider's export has no timezone marker on its timestamps, and it's
// a cashier-facing daily statement — treat it as already-local Eswatini
// wall-clock time (fixed UTC+2, matches dayBounds.ts's SAST_OFFSET_HOURS).
function parseStatementTimestamp(raw: string): Date | null {
  const trimmed = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) return null
  const d = new Date(`${trimmed.replace(' ', 'T')}+02:00`)
  return isNaN(d.getTime()) ? null : d
}

function parseDecimal(raw: string | undefined): Decimal | null {
  if (!raw || !raw.trim()) return null
  try {
    return new Decimal(raw.trim())
  } catch {
    return null
  }
}

function parseCsv(csvText: string): { lines: ParsedLine[]; skipped: number } {
  const result = Papa.parse<MomoCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const lines: ParsedLine[] = []
  let skipped = 0

  for (const row of result.data) {
    const transactionDate = parseStatementTimestamp(row['Date'] ?? '')
    const amount = parseDecimal(row['Amount'])
    if (!transactionDate || !amount) { skipped++; continue }

    lines.push({
      externalTxnId:   row['Id']?.trim() || null,
      transactionDate,
      dateLabel:       (row['Date'] ?? '').trim().slice(0, 10),
      status:          (row['Status'] ?? '').trim() || 'Unknown',
      type:            (row['Type'] ?? '').trim() || 'Unknown',
      fromName:        row['From name']?.trim() || null,
      toName:          row['To name']?.trim() || null,
      toMessage:       row['To message']?.trim() || null,
      amount,
      fee:             parseDecimal(row['From / Fee']) ?? new Decimal(0),
      balance:         parseDecimal(row['Balance']),
    })
  }

  return { lines, skipped }
}

// The calendar day the statement is "for" — the SAST date label that shows
// up on the most rows (a daily export should be overwhelmingly one date;
// a stray row either side of midnight shouldn't hijack the whole import).
function pickStatementDateLabel(lines: ParsedLine[]): string {
  const counts = new Map<string, number>()
  for (const l of lines) counts.set(l.dateLabel, (counts.get(l.dateLabel) ?? 0) + 1)
  let best = ''
  let bestCount = -1
  counts.forEach((count, label) => {
    if (count > bestCount) { best = label; bestCount = count }
  })
  return best
}

export async function importMomoStatement(
  fileName: string,
  csvText: string,
  userId?: string,
) {
  const { lines: allLines, skipped } = parseCsv(csvText)
  if (allLines.length === 0) throw new MomoStatementEmptyError()

  const statementDateLabel = pickStatementDateLabel(allLines)
  const statementDate = sastDateLabelToUTCDate(statementDateLabel)

  const successful = allLines.filter((l) => l.status === 'Successful')
  const failedCount = allLines.length - successful.length

  const totalSent = successful
    .filter((l) => l.amount.isNegative())
    .reduce((sum, l) => sum.plus(l.amount.abs()), new Decimal(0))
  const totalReceived = successful
    .filter((l) => !l.amount.isNegative())
    .reduce((sum, l) => sum.plus(l.amount), new Decimal(0))
  const totalFees = successful.reduce((sum, l) => sum.plus(l.fee), new Decimal(0))

  const byDateAsc = [...successful].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())
  const first = byDateAsc[0]
  const last  = byDateAsc[byDateAsc.length - 1]
  const openingBalance = first?.balance != null ? first.balance.minus(first.amount) : null
  const closingBalance = last?.balance ?? null

  const tenantId = requireTenantId()

  const importRow = await prisma.$transaction(async (tx) => {
    // Re-uploading the same day's statement (e.g. cashier fixing a bad
    // export) replaces it outright rather than piling up duplicates.
    const existing = await tx.momoStatementImport.findUnique({
      where: { tenantId_statementDate: { tenantId, statementDate } },
    })
    if (existing) await tx.momoStatementImport.delete({ where: { id: existing.id } })

    return tx.momoStatementImport.create({
      data: {
        tenantId,
        fileName,
        statementDate,
        totalSent,
        totalReceived,
        totalFees,
        transactionCount: successful.length,
        failedCount,
        openingBalance:   openingBalance ?? undefined,
        closingBalance:   closingBalance ?? undefined,
        uploadedByUserId: userId,
        lines: {
          create: allLines.map((l) => ({
            tenantId,
            externalTxnId:   l.externalTxnId,
            transactionDate: l.transactionDate,
            status:          l.status,
            type:            l.type,
            fromName:        l.fromName,
            toName:          l.toName,
            toMessage:       l.toMessage,
            amount:          l.amount,
            fee:             l.fee,
            balance:         l.balance ?? undefined,
          })),
        },
      },
    })
  })

  // Store the original file for audit — best-effort, doesn't block the import.
  try {
    const key = momoStatementCsvKey(importRow.id)
    await uploadBytes(key, new TextEncoder().encode(csvText), 'text/csv')
    await prisma.momoStatementImport.update({ where: { id: importRow.id }, data: { r2Key: key } })
  } catch (err) {
    logger.error({ err, importId: importRow.id }, 'momoStatement.csv.archive.failed')
  }

  logger.info(
    {
      importId: importRow.id, statementDate: statementDateLabel, userId,
      transactionCount: successful.length, skippedRows: skipped, failedCount,
      totalSent: totalSent.toFixed(2), totalReceived: totalReceived.toFixed(2), totalFees: totalFees.toFixed(2),
    },
    'momoStatement.imported',
  )

  return { import: importRow, skippedRows: skipped }
}

export async function listMomoStatements(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const [imports, total] = await Promise.all([
    prisma.momoStatementImport.findMany({
      orderBy: { statementDate: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.momoStatementImport.count(),
  ])

  return { imports, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

export async function getMomoStatement(id: string) {
  const found = await prisma.momoStatementImport.findUnique({
    where: { id },
    include: { lines: { orderBy: { transactionDate: 'desc' } } },
  })
  if (!found) throw new MomoStatementNotFoundError(id)
  return found
}

export async function getMomoStatementForDate(statementDate: Date) {
  const tenantId = requireTenantId()
  return prisma.momoStatementImport.findUnique({
    where: { tenantId_statementDate: { tenantId, statementDate } },
  })
}

export async function deleteMomoStatement(id: string) {
  const found = await prisma.momoStatementImport.findUnique({ where: { id } })
  if (!found) throw new MomoStatementNotFoundError(id)
  await prisma.momoStatementImport.delete({ where: { id } })
  logger.info({ importId: id }, 'momoStatement.deleted')
}
