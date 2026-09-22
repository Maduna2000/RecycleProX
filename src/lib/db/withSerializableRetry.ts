// Retries on PostgreSQL serialization failures (P2034 / 40001) — for use around
// prisma.$transaction calls run with Serializable isolation. Also retries a
// bare unique-constraint hit (P2002) — belt and suspenders for a ref-number
// generator that reads its next value via MAX/findFirst (see loanService.ts/
// expenseService.ts/businessLoanService.ts/gateService.ts/scaleService.ts):
// two requests can still race between that read and either one's insert.
export async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn()
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      if (attempt < 3 && (code === 'P2034' || code === '40001' || code === 'P2002')) continue
      throw e
    }
  }
  throw new Error('unreachable')
}
