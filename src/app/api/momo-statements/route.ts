import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { importMomoStatement, listMomoStatements, MomoStatementEmptyError } from '@/lib/services/momoStatementService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const MAX_CSV_BYTES = 5 * 1024 * 1024

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50')

  try {
    const result = await runWithRequestTenant(req, () => listMomoStatements({ page, pageSize }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/momo-statements failed')
    return NextResponse.json({ error: 'Failed to fetch MoMo statements' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can upload a MoMo statement' }, { status: 403 })
  }

  let file: File
  try {
    const formData = await req.formData()
    const f = formData.get('file')
    if (!f || !(f instanceof File)) {
      return NextResponse.json({ error: 'file field is required' }, { status: 422 })
    }
    file = f
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: 'File too large — maximum 5 MB' }, { status: 422 })
  }

  const csvText = await file.text()

  try {
    const { import: importRow, skippedRows } = await runWithRequestTenant(req, () =>
      importMomoStatement(file.name, csvText, session.user.id))
    return NextResponse.json({ import: importRow, skippedRows }, { status: 201 })
  } catch (err) {
    if (err instanceof MomoStatementEmptyError) return NextResponse.json({ error: err.message }, { status: 422 })
    const message = 'Failed to import MoMo statement'
    logger.error({ err }, 'POST /api/momo-statements failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
