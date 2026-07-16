import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { prisma } from '@/lib/db/prisma'

// ONE-TIME USE — read-only data-integrity check after a user reported
// "casual table" seemingly missing. There is no separate casual table —
// casual customers are Customer rows with customerType='casual' — this
// confirms the real row counts are intact, not lost. Delete after use.
export async function GET(req: Request) {
  const { response } = await requireRole(['admin'])
  if (response) return response

  const result = await runWithRequestTenant(req, async () => {
    const totalCustomers = await prisma.customer.count()
    const casualCount = await prisma.customer.count({ where: { customerType: 'casual' } })
    const accountCount = await prisma.customer.count({ where: { customerType: 'account' } })
    const sample = await prisma.customer.findMany({
      where: { customerType: 'casual' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, firstName: true, lastName: true, idNumber: true, createdAt: true },
    })
    return { totalCustomers, casualCount, accountCount, sampleOfLatestCasuals: sample }
  })

  return NextResponse.json(result)
}
