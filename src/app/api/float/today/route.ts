import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTodayFloat, getMostRecentFloatBefore } from '@/lib/services/floatService'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const today = new Date()
  const [record, prevFloat] = await Promise.all([
    getTodayFloat(),
    getMostRecentFloatBefore(today),
  ])

  // Suggested carry-forward: previous day's closing, or opening if not yet closed
  const suggestedAmount = prevFloat?.closingAmount?.toString()
    ?? prevFloat?.openingAmount?.toString()
    ?? null

  return NextResponse.json({
    today: record ?? null,
    suggestedAmount,
    suggestedDate: prevFloat ? prevFloat.floatDate : null,
  })
}
