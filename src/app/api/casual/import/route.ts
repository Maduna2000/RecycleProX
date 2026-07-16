import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import Papa from 'papaparse'
import { z } from 'zod'

// ─── Per-row schema ────────────────────────────────────────────────────────────

const RowSchema = z.object({
  idNumber:        z.string().min(3).max(30),
  firstName:       z.string().min(1).max(80),
  lastName:        z.string().min(1).max(80),
  phone:           z.string().max(20).optional().default(''),
  dateOfBirth:     z.string().optional(),
  gender:          z.string().max(20).optional().default(''),
  nationality:     z.string().max(60).optional().default(''),
  physicalAddress: z.string().max(300).optional().default(''),
})

type RowInput = z.infer<typeof RowSchema>

type ImportError = { row: number; reason: string }

/**
 * POST /api/casual/import
 * Body: multipart/form-data with file field "csv"
 * Parses CSV, validates rows, upserts customers (match on idNumber).
 * Manager/admin only.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — manager or admin required' }, { status: 403 })
  }

  let csvText: string
  try {
    const formData = await req.formData()
    const file = formData.get('csv')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'csv file field is required' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 })
    }
    csvText = await file.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read uploaded file' }, { status: 400 })
  }

  // Parse CSV
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
    transform: (v: string) => v.trim(),
  })

  if (!parsed.data.length) {
    return NextResponse.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 })
  }

  const errors: ImportError[] = []
  const validRows: RowInput[] = []

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i] ?? {}
    // Normalise common header variants
    const normalised = {
      idNumber:        raw['idNumber']        ?? raw['id_number']        ?? raw['ID Number']       ?? '',
      firstName:       raw['firstName']       ?? raw['first_name']       ?? raw['First Name']      ?? '',
      lastName:        raw['lastName']        ?? raw['last_name']        ?? raw['Last Name']       ?? raw['surname'] ?? raw['Surname'] ?? '',
      phone:           raw['phone']           ?? raw['Phone']            ?? raw['cellphone']       ?? '',
      dateOfBirth:     raw['dateOfBirth']     ?? raw['date_of_birth']    ?? raw['Date of Birth']   ?? undefined,
      gender:          raw['gender']          ?? raw['Gender']           ?? '',
      nationality:     raw['nationality']     ?? raw['Nationality']      ?? '',
      physicalAddress: raw['physicalAddress'] ?? raw['physical_address'] ?? raw['Physical Address'] ?? '',
    }

    const result = RowSchema.safeParse(normalised)
    if (!result.success) {
      const msg = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
      errors.push({ row: i + 2, reason: msg }) // +2 = 1-indexed + header row
    } else {
      validRows.push(result.data)
    }
  }

  if (validRows.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0, errors }, { status: 422 })
  }

  // Upsert valid rows in a single transaction
  let imported = 0
  let skipped  = 0

  await prisma.$transaction(async (tx) => {
    const tenantId = requireTenantId()
    for (const row of validRows) {
      let dob: Date | undefined
      if (row.dateOfBirth) {
        const d = new Date(row.dateOfBirth)
        if (!isNaN(d.getTime())) dob = d
      }

      // Check if already exists
      const existing = await tx.customer.findUnique({ where: { tenantId_idNumber: { tenantId, idNumber: row.idNumber } } })

      if (existing) {
        // Update existing customer
        await tx.customer.update({
          where: { tenantId_idNumber: { tenantId, idNumber: row.idNumber } },
          data: {
            firstName:       row.firstName,
            lastName:        row.lastName,
            phone:           row.phone || existing.phone,
            dateOfBirth:     dob ?? existing.dateOfBirth,
            gender:          ((row.gender as 'male' | 'female' | 'other' | undefined) || existing.gender) ?? undefined,
            nationality:     row.nationality || existing.nationality || undefined,
            physicalAddress: row.physicalAddress || existing.physicalAddress || undefined,
          },
        })
        skipped++
      } else {
        // Create new casual customer
        await tx.customer.create({
          data: {
            tenantId,
            idNumber:        row.idNumber,
            firstName:       row.firstName,
            lastName:        row.lastName,
            phone:           row.phone,
            customerType:    'casual',
            dateOfBirth:     dob,
            gender:          (row.gender as 'male' | 'female' | 'other' | undefined) || undefined,
            nationality:     row.nationality || undefined,
            physicalAddress: row.physicalAddress || undefined,
            isActive:        true,
            blacklisted:     false,
          },
        })
        imported++
      }
    }
  })

  logger.info({ userId: session.user.id, imported, skipped, errors: errors.length }, 'casual.import')
  return NextResponse.json({ imported, skipped, errors })
}
