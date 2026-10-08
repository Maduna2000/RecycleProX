import { NextResponse } from 'next/server'

// Superseded by /api/expenses/receipts-export. The first version streamed the
// ZIP itself; the current one returns a download link instead, so a copy of
// the Expenses page loaded before the update would save that JSON reply as a
// ".zip". Answering with an error makes such a page show this message as a
// toast instead.
export function GET() {
  return NextResponse.json(
    { error: 'This page is out of date. Reload it (Ctrl+Shift+R) and click Receipts (ZIP) again.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
