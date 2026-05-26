import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getAllScaleOrdersForExport, resolveCustomerName, resolveCustomerPhone } from '@/lib/services/scaleService'
import * as XLSX from 'xlsx'
import Decimal from 'decimal.js'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const p      = req.nextUrl.searchParams
  const format = p.get('format') ?? 'csv'

  const orders = await getAllScaleOrdersForExport({
    dateFrom:   p.get('dateFrom')   ?? undefined,
    dateTo:     p.get('dateTo')     ?? undefined,
    status:     (p.get('status')    ?? undefined) as 'pending' | 'processed' | 'voided' | undefined,
    operatorId: p.get('operatorId') ?? undefined,
    productId:  p.get('productId')  ?? undefined,
    categoryName: p.get('categoryName') ?? undefined,
    search:     p.get('search')     ?? undefined,
  })

  const rows = orders.map(o => ({
    'Order #':       o.orderNumber,
    'Date':          new Date(o.createdAt).toLocaleDateString('en-ZA'),
    'Time':          new Date(o.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
    'Customer':      resolveCustomerName(o),
    'Phone':         resolveCustomerPhone(o),
    'Category':      o.product.category,
    'Product':       o.product.name,
    'Weight':        new Decimal(o.weight.toString()).toFixed(3),
    'Unit':          o.product.unit,
    'Status':        o.status,
    'Operator':      o.operator.fullName,
    'Notes':         o.notes ?? '',
    'Void Reason':   o.voidReason ?? '',
  }))

  try {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Scale Orders')

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws)
      logger.info({ count: orders.length, userId: session.user.id }, 'scale.export.csv')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="scale-orders-${Date.now()}.csv"`,
        },
      })
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    logger.info({ count: orders.length, userId: session.user.id }, 'scale.export.xlsx')
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="scale-orders-${Date.now()}.xlsx"`,
      },
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/scale/reports/export failed')
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
