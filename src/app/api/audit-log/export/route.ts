import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { listAuditLogs } from '@/lib/services/auditLogService'
import { buildReportMeta } from '@/lib/services/reports/meta'
import { generateBusinessReportXlsx } from '@/lib/excel/businessReportXlsx'
import type { ReportDocument } from '@/lib/reports/types'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * GET /api/audit-log/export?table=&action=&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Downloads the filtered audit log as an .xlsx file. Admin only.
 * Filter params mirror GET /api/audit-log so the export matches the list view.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 })
  }

  const sp      = req.nextUrl.searchParams
  const table   = sp.get('table')  ?? undefined
  const action  = sp.get('action') ?? undefined
  const fromStr = sp.get('from')   ?? undefined
  const toStr   = sp.get('to')     ?? undefined

  const from = fromStr ? (() => { const d = new Date(fromStr); d.setHours(0, 0, 0, 0); return d })() : undefined
  const to   = toStr   ? (() => { const d = new Date(toStr);   d.setHours(23, 59, 59, 999); return d })() : undefined

  try {
    const { items, meta } = await runWithRequestTenant(req, async () => {
      const { items } = await listAuditLogs({
        table,
        action: action as 'INSERT' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT' | undefined,
        from,
        to,
        page: 1,
        pageSize: 10000,
      })
      const meta = await buildReportMeta(session.user.name ?? session.user.username ?? 'Unknown')
      return { items, meta }
    })
    if (meta.company.name === 'Renovo Pro') {
      meta.company = { ...meta.company, name: 'Golden Key Investments (Pty) Ltd' }
    }

    const oldest = items.length ? items[items.length - 1]!.createdAt : new Date()

    const doc: ReportDocument = {
      reportId: 'audit-log',
      title: 'Audit Log',
      subtitle: [
        table && `Table: ${table}`,
        action && `Action: ${action}`,
      ].filter(Boolean).join(' · ') || undefined,
      params: {
        from: (from ?? oldest).toISOString(),
        to: (to ?? new Date()).toISOString(),
      },
      columns: [
        { key: 'time',     label: 'Time',      width: 0.16, format: 'datetime', excelWidth: 18 },
        { key: 'action',   label: 'Action',    width: 0.09, excelWidth: 10 },
        { key: 'table',    label: 'Table',     width: 0.14, excelWidth: 16 },
        { key: 'recordId', label: 'Record ID', width: 0.29, excelWidth: 38 },
        { key: 'user',     label: 'User',      width: 0.18, excelWidth: 20 },
        { key: 'ip',       label: 'IP',        width: 0.14, excelWidth: 16 },
      ],
      groups: [
        {
          level: 0,
          label: 'AUDIT ENTRIES',
          rows: items.map((item) => ({
            cells: {
              time:     item.createdAt.toISOString(),
              action:   item.action,
              table:    item.tableName,
              recordId: item.recordId,
              user:     item.changedByName ?? item.changedById ?? '—',
              ip:       item.ipAddress ?? '',
            },
          })),
        },
      ],
      meta: { ...meta, rowCount: items.length },
    }

    const body = generateBusinessReportXlsx(doc)
    const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`

    logger.info({ userId: session.user.id, rows: items.length }, 'audit.export')

    return new NextResponse(body, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(body.byteLength),
      },
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/audit-log/export failed')
    return NextResponse.json({ error: 'Failed to export audit log' }, { status: 500 })
  }
}
