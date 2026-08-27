import { PrismaClient, Prisma } from '@prisma/client'
import { attachAuditMiddleware } from './auditMiddleware'
import { activeTenantId, activeTenantTx, requireTenantId } from './tenantContext'

const globalForPrisma = globalThis as unknown as { rawPrisma: PrismaClient }

// Prisma's own client-side connection pool defaults to `numCPUs*2+1` —
// on a 2-core desktop install that computed to just 5, and a single
// dashboard page mount fires 15-20 concurrent requests (see
// withTenantScope below — every one of them opens its own transaction).
// That's not a timing problem the wider maxWait/timeout below can fix on
// its own: most of those requests were queuing for a connection that
// never freed up in the 10s default pool_timeout, failing with Prisma's
// P2024 "Timed out fetching a new connection from the connection pool".
// Neon's pooled endpoint (the "-pooler" hostname every deployment target
// already uses) is PgBouncer underneath, built to multiplex far more
// app-side connections than that default — raising the ceiling here is
// safe. Only applied when the URL doesn't already specify these, so an
// operator who's deliberately tuned a connection string isn't overridden.
function withPoolParams(url: string): string {
  try {
    const u = new URL(url)
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '20')
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '20')
    return u.toString()
  } catch {
    return url
  }
}

const RAW_DB_URL = process.env.APP_RUNTIME_DATABASE_URL || process.env.DATABASE_URL

// The single underlying connection — every tenant's data lives in these
// same tables now (see i-need-you-to-vectorized-pumpkin.md Section 2-4).
// Isolation comes from Postgres Row-Level Security (prisma/migrations/
// 20260716000003_enable_rls) plus the tenant-scoping wrapper below, not
// from picking a different client/schema per tenant.
//
// Deliberately NOT the same role `prisma migrate deploy` uses. Neon's
// default owner role has BYPASSRLS, which silently defeats FORCE ROW LEVEL
// SECURITY regardless of policy correctness (see the critical finding in
// project_saas_platform_initiative.md) — the app's actual runtime queries
// must connect as a separate, restricted role (NOBYPASSRLS, plain CRUD
// grants, not table owner) for RLS to mean anything. Migrations still run
// as the owner role (DATABASE_URL, needs DDL privileges the restricted
// role doesn't have) — only the app's own query connection switches.
// Falls back to DATABASE_URL where APP_RUNTIME_DATABASE_URL isn't set
// (local dev, scratch testing) rather than requiring every environment to
// provision the restricted role.
const rawClient =
  globalForPrisma.rawPrisma ||
  attachAuditMiddleware(
    new PrismaClient({
      datasourceUrl: RAW_DB_URL ? withPoolParams(RAW_DB_URL) : RAW_DB_URL,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    }),
  )

if (process.env.NODE_ENV !== 'production') globalForPrisma.rawPrisma = rawClient

// Every tenant-owned model per prisma/schema.prisma — kept as an explicit
// literal set (not derived from Prisma.dmmf at runtime) so a model added to
// the schema without a tenantId column, or without being added here, fails
// loudly (falls through to the unscoped branch below and hits RLS's
// fail-closed zero-rows behavior, or a NOT NULL violation on write) rather
// than silently leaking data. Deliberately excludes Tenant itself (global,
// no tenantId column, queried only via registryPrisma).
const TENANT_SCOPED_MODELS = new Set([
  'user', 'userModuleAccess', 'auditLog', 'systemSettings', 'customer',
  'customerDocument', 'product', 'priceGroup', 'priceGroupProductOverride',
  'priceHistory', 'productCategory', 'categoryStepConfig',
  'purchase', 'purchaseLine', 'sale', 'saleLine', 'stockMovement', 'payment',
  'expenseType', 'expense', 'expenseAttachment', 'cashFloat', 'stocktake',
  'stocktakeEntry', 'cashUp', 'loan', 'loanRepayment', 'policeVisit',
  'policeSearchLog', 'mediaFile', 'floatMovement', 'transactionPayment',
  'transactionPaymentLink', 'scaleOrder', 'scaleOrderLine',
  'gateEntry', 'gatePurposeConfig', 'gateSellOption', 'businessLoan', 'businessLoanRepayment',
  'momoStatementImport', 'momoStatementLine', 'priceList', 'priceListItem',
  'account', 'journalEntry', 'journalLine', 'productAverageCost',
])

// Top-level raw-query methods — routed through the same tenant-scoping
// wrapper as model delegates. Without this, a raw query issued directly on
// `prisma` (e.g. cashUpService.ts's live-stats queries) would run on a
// pooled connection with no tenant pinned, and RLS would silently return
// zero rows rather than the caller's intended (still-tenant-scoped) result.
const RAW_QUERY_METHODS = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe'])

// Top-level model-delegate methods that insert new rows — the ones that
// need tenantId auto-stamped into their payload. Every other method
// (findMany, update, delete, count, ...) relies on RLS alone (USING/WITH
// CHECK) for correctness; stamping there would be redundant, not required.
const WRITE_METHODS_NEEDING_TENANT_ID = new Set(['create', 'createMany', 'upsert'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stampTenantId(method: string, args: any, tenantId: string): any {
  if (!args || typeof args !== 'object') return args
  if (method === 'create') {
    return { ...args, data: { ...(args.data ?? {}), tenantId } }
  }
  if (method === 'createMany') {
    const data = args.data
    if (Array.isArray(data)) {
      return { ...args, data: data.map((d: object) => ({ ...d, tenantId })) }
    }
    return { ...args, data: { ...(data ?? {}), tenantId } }
  }
  if (method === 'upsert') {
    return { ...args, create: { ...(args.create ?? {}), tenantId } }
  }
  return args
}

// Wraps a transaction client (or the raw base client) so that
// `tx.<model>.<method>(...)` calls made *directly* on it — the common
// pattern for multi-table writes required by CLAUDE.md's "single Prisma
// transaction" rule, e.g. purchaseService.ts's
// `tx.purchase.create({ data: { ..., lines: { create: [...] } } })` — get
// the same tenantId auto-stamping as calls made through the top-level
// `prisma` proxy below. Without this, only bare `prisma.x.y()` calls would
// benefit, and every transactional service function would need manual
// tenantId additions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapAsTenantScoped(client: any, tenantId: string): any {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && TENANT_SCOPED_MODELS.has(prop)) {
        const delegate = Reflect.get(target, prop, receiver)
        return new Proxy(delegate, {
          get(delegateTarget, method, delegateReceiver) {
            const fn = Reflect.get(delegateTarget, method, delegateReceiver)
            if (typeof fn !== 'function' || typeof method !== 'string') return fn
            if (!WRITE_METHODS_NEEDING_TENANT_ID.has(method)) return fn.bind(delegateTarget)
            return (...args: unknown[]) => {
              const [firstArg, ...rest] = args
              return fn.call(delegateTarget, stampTenantId(method, firstArg, tenantId), ...rest)
            }
          },
        })
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

async function pinTenantContext(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  // set_config(..., true) = SET LOCAL semantics: scoped to the current
  // transaction only, safe under PgBouncer transaction-mode pooling (Neon's
  // pooled connection string) since it's the first statement of the same
  // transaction as everything that follows in this block. Parameterized
  // (not string-interpolated) per the search_path bug this design
  // deliberately avoids repeating (Section 4.2).
  await tx.$queryRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, tenantId)
}

// Opens one transaction, pins the current request's tenant as the first
// statement, then runs `fn` against a tenant-scoped wrapper of that
// transaction's client. If already inside a tenant-scoped transaction (a
// nested prisma.* call made from within another withTenantScope block, or
// a service calling the top-level `prisma` proxy from inside its own
// explicit transaction callback), reuses the ambient transaction instead of
// opening a second one — Postgres has no true nested transactions, and the
// tenant pin only applies to the transaction it was issued in.
//
// `options` (isolationLevel/maxWait/timeout) is forwarded to the underlying
// $transaction call — several services (e.g. stocktakeService.ts's
// createStocktake, which needs Serializable isolation to prevent two
// near-simultaneous requests both passing its "no open stocktake" check)
// depend on this actually reaching Postgres, not being silently dropped.
//
// EVERY prisma.<model>.<method>() call — including a single-row SELECT —
// goes through here, because the RLS tenant pin (pinTenantContext) has to
// run as the first statement of the same transaction as the query it's
// scoping. Prisma's own interactive-transaction defaults (maxWait 2000ms,
// timeout 5000ms) assume a transaction is a deliberate, occasional thing;
// here it's the shape of every request. Against Neon's pooled endpoint —
// which can take several seconds to wake a suspended compute, and which
// this app hits with 15-20 concurrent requests on a single dashboard
// load — that 2-second window to even acquire a connection was the
// direct cause of the P2028 "unable to start a transaction in the given
// time" flood seen in the desktop app's logs. Callers that need something
// different (the Serializable writes above) still override via `options`;
// this is only the floor for everyone else.
const DEFAULT_TENANT_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 }

export async function withTenantScope<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  const existingTx = activeTenantTx.getStore() as Prisma.TransactionClient | undefined
  if (existingTx) return fn(existingTx)

  const tenantId = requireTenantId()
  // Merged, not `options ?? DEFAULT_TENANT_TX_OPTIONS` — a caller passing only
  // `{ isolationLevel: Serializable }` (every purchase-mutation call site: create,
  // void, reverse payment, update, settle, split payment) would otherwise replace
  // the whole options object, silently reverting maxWait/timeout to Prisma's stock
  // 2000ms/5000ms for exactly the highest-latency multi-step transactions that need
  // the longer window most. This is what caused the P2028 "transaction already
  // closed... timeout was 5000 ms" failures still seen in the desktop app's logs
  // after the maxWait/timeout fix above already shipped.
  return rawClient.$transaction(async (tx) => {
    await pinTenantContext(tx, tenantId)
    const scopedTx = wrapAsTenantScoped(tx, tenantId) as Prisma.TransactionClient
    return activeTenantId.run(tenantId, () => activeTenantTx.run(scopedTx, () => fn(scopedTx)))
  }, { ...DEFAULT_TENANT_TX_OPTIONS, ...options })
}

function dispatch(prop: string, method: string, args: unknown[]): unknown {
  const existingTx = activeTenantTx.getStore() as Prisma.TransactionClient | undefined
  if (existingTx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (existingTx as any)[prop][method](...args)
  }
  const tenantId = requireTenantId()
  return withTenantScope((tx) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Promise.resolve((wrapAsTenantScoped(tx, tenantId) as any)[prop][method](...args)),
  )
}

// Every ~50 existing `prisma.x.y()` / `prisma.$transaction(cb)` call site
// keeps compiling and behaving the same — no per-call-site changes needed.
// `prisma.<model>` returns a wrapper delegate whose methods auto-open (or
// join) a tenant-scoped transaction and auto-stamp tenantId on inserts;
// `prisma.$transaction`/raw-query methods do the same at the top level.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (prop === '$transaction') {
      return (
        arg: unknown,
        options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
      ) => {
        if (typeof arg !== 'function') {
          throw new Error(
            'Array-form prisma.$transaction([...]) is not supported under tenant ' +
              'scoping — use the callback form: prisma.$transaction(async (tx) => { ... })',
          )
        }
        const existingTx = activeTenantTx.getStore() as Prisma.TransactionClient | undefined
        if (existingTx) return (arg as (tx: Prisma.TransactionClient) => unknown)(existingTx)
        return withTenantScope((tx) => Promise.resolve((arg as (tx: Prisma.TransactionClient) => unknown)(tx)), options)
      }
    }

    if (typeof prop === 'string' && RAW_QUERY_METHODS.has(prop)) {
      return (...args: unknown[]) => {
        const existingTx = activeTenantTx.getStore() as Prisma.TransactionClient | undefined
        if (existingTx) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (existingTx as any)[prop](...args)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return withTenantScope((tx) => (tx as any)[prop](...args))
      }
    }

    if (typeof prop === 'string' && TENANT_SCOPED_MODELS.has(prop)) {
      return new Proxy(
        {},
        {
          get(_delegateTarget, method) {
            if (typeof method !== 'string') return undefined
            return (...args: unknown[]) => dispatch(prop, method, args)
          },
        },
      )
    }

    // Non-model, non-transactional access ($connect, $disconnect, $on, ...)
    // — resolved directly against the raw client, no tenant scoping needed.
    const value = Reflect.get(rawClient as object, prop, receiver)
    return typeof value === 'function' ? value.bind(rawClient) : value
  },
})

// A genuine "can we reach Postgres right now" check, deliberately bypassing
// the tenant-scoping Proxy above (which requires a resolved tenant context
// for every raw-query method) — used by /api/ping, which has no session and
// must work as an unauthenticated liveness probe. SELECT 1 touches no table,
// so there's nothing for RLS to restrict; this is safe to run with no
// tenant pinned.
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await rawClient.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export default prisma
