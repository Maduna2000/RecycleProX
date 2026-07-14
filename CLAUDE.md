# Renovo Pro — Master Rules (CLAUDE.md)

## Project
Renovo Pro — production-grade recycling yard management system.
Golden Key Investments (Pty) Ltd, Matsapha, Eswatini.
(Feature reference: replicates the legacy "RecycleProX" software — never use
that name or "Lariat Technologies" in user-facing output.)

## Stack
Next.js 14 App Router · TypeScript strict · Prisma ORM · PostgreSQL
shadcn/ui · Tailwind CSS · NextAuth v5 · Zod · TanStack Query
Zustand · pdf-lib · node-thermal-printer · pino · Vitest

## Hosting (zero cost)
- App: Vercel (free)
- DB: Neon or Aiven free tier (env: DATABASE_URL)
- Files: Cloudflare R2 (env: R2_*) — replaces DATA_DIR
- Email: Resend (env: RESEND_API_KEY)

## Folder Structure
src/app/              Next.js pages + API routes
src/components/       Shared UI components
src/lib/db/           Prisma client singleton + query functions
src/lib/services/     Business logic (no HTTP, no UI)
src/lib/schemas/      Zod schemas (shared frontend + backend)
src/lib/pdf/          PDF generation templates
src/lib/print/        Thermal print formatters
src/lib/r2/           Cloudflare R2 file storage helpers
src/hooks/            Custom React hooks
src/stores/           Zustand stores
prisma/schema.prisma + migrations/ + seed.ts

## ZERO TOLERANCE PRODUCTION RULES
1. All money = Decimal.js — NEVER use parseFloat, Math.round, or JS float for money
2. All multi-table DB writes = single Prisma transaction — partial writes impossible
3. All inputs validated with Zod before any DB call
4. All IDs = UUID — never auto-increment integers for business records
5. Every API route checks auth session AND role before any logic
6. Errors bubble up typed and logged with pino — never swallowed silently
7. No console.log in any file — use pino logger only
8. All file paths use R2 keys, never local filesystem paths
9. Audit log written on every INSERT/UPDATE/DELETE via Prisma middleware
10. Schema managed via Prisma migrations — no raw DDL ever

## Reference: Module Build Order
M1 Auth → M2 Customers → M3+M4 Products+Pricing → M5 Purchases
→ M6 Sales → M7 Payments → M8 Stock → M9 Photos
→ M10 Cash-up → M11 Print+Docs → M12 Police Register
→ M13 Reports → M14 Audit Log → Final Validation
