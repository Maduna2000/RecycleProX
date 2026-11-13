/**
 * Copy one company's catalogue and configuration into another company.
 *
 *   npx ts-node prisma/clone-tenant-config.ts --from <source-slug> --to <target-slug>            # dry run (default)
 *   npx ts-node prisma/clone-tenant-config.ts --from <source-slug> --to <target-slug> --apply    # write
 *
 * Copies (only these tables — no transactions, stock, customers or users):
 *   - ProductCategory (including sub-category hierarchy)
 *   - CategoryStepConfig (Scale Station per-category weight/photo requirements)
 *   - Product (code, name, category, unit, default buy/sell price, min stock, margin)
 *   - SystemSettings (all keys EXCEPT company identity, secrets and per-user keys — see SKIP_*)
 *
 * Safe by default: dry run unless --apply; existing rows in the target are left
 * untouched (matched by category name / product code / setting key) unless
 * --overwrite is given; everything is written in ONE transaction pinned to the
 * target company, so it either fully applies or not at all. Source data is only read.
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'
import { z } from 'zod'

const ArgsSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  apply: z.boolean(),
  overwrite: z.boolean(),
  exclude: z.array(z.string()),
}).refine((a) => a.from !== a.to, { message: '--from and --to must be different companies' })

function parseArgs(argv: string[]) {
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined }
  return ArgsSchema.parse({
    from: get('--from'),
    to: get('--to'),
    apply: argv.includes('--apply'),
    overwrite: argv.includes('--overwrite'),
    exclude: (get('--exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  })
}

// Company identity and secrets must never be copied to a different company.
const SKIP_SETTING_KEYS = new Set([
  'yardName', 'yardAddress', 'yardPhone', 'yardVat', 'vatNumber', // who the company is
  'police_service_name',                                            // identity of the local police unit
  'companyLogoR2Key',                                               // points at the source company's stored file
  'defaultPin',                                                     // credential
])
const SKIP_SETTING_PREFIXES = ['user:']                              // per-user preferences (user ids differ)
const SECRET_LOOKING = /(pin|password|secret|token|apikey|api_key)/i

function skipReason(key: string, extraExcluded: string[]): string | null {
  if (extraExcluded.includes(key)) return 'excluded by --exclude'
  if (SKIP_SETTING_KEYS.has(key)) return 'company identity / secret'
  if (SKIP_SETTING_PREFIXES.some((p) => key.startsWith(p))) return 'per-user setting'
  if (SECRET_LOOKING.test(key)) return 'looks like a secret'
  return null
}

const out = (s: string) => process.stdout.write(s + '\n')

async function pin(tx: Prisma.TransactionClient, tenantId: string) {
  // Same mechanism the app uses (src/lib/db/prisma.ts): row-level security is
  // keyed on this transaction-local setting.
  await tx.$queryRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, tenantId)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const prisma = new PrismaClient()
  try {
    const [source, target] = await Promise.all([
      prisma.tenant.findUnique({ where: { companySlug: args.from } }),
      prisma.tenant.findUnique({ where: { companySlug: args.to } }),
    ])
    if (!source) throw new Error(`No company with slug "${args.from}"`)
    if (!target) throw new Error(`No company with slug "${args.to}"`)
    out(`Source: ${source.companyName} (${source.companySlug})`)
    out(`Target: ${target.companyName} (${target.companySlug})`)
    out(args.apply ? 'Mode: APPLY (writing)' : 'Mode: DRY RUN (nothing will be written — add --apply to write)')

    // 1. Read the source (pinned to the source company).
    const src = await prisma.$transaction(async (tx) => {
      await pin(tx, source.id)
      const [categories, stepConfigs, products, settings] = await Promise.all([
        tx.productCategory.findMany({ where: { tenantId: source.id } }),
        tx.categoryStepConfig.findMany({ where: { tenantId: source.id } }),
        tx.product.findMany({ where: { tenantId: source.id } }),
        tx.systemSettings.findMany({ where: { tenantId: source.id } }),
      ])
      return { categories, stepConfigs, products, settings }
    })

    const settingsToCopy = src.settings.filter((s) => skipReason(s.key, args.exclude) === null)
    const settingsSkipped = src.settings.filter((s) => skipReason(s.key, args.exclude) !== null)

    // 2. Plan against what the target already has.
    const plan = await prisma.$transaction(async (tx) => {
      await pin(tx, target.id)
      const [cats, products, steps, settings] = await Promise.all([
        tx.productCategory.findMany({ where: { tenantId: target.id } }),
        tx.product.findMany({ where: { tenantId: target.id }, select: { id: true, code: true } }),
        tx.categoryStepConfig.findMany({ where: { tenantId: target.id }, select: { categoryId: true } }),
        tx.systemSettings.findMany({ where: { tenantId: target.id }, select: { key: true } }),
      ])
      return { cats, products, steps, settings }
    })
    const targetCatByName = new Map(plan.cats.map((c) => [c.name, c.id]))
    const targetProductCodes = new Set(plan.products.map((p) => p.code))
    const targetStepCats = new Set(plan.steps.map((s) => s.categoryId))
    const targetSettingKeys = new Set(plan.settings.map((s) => s.key))

    const newCats = src.categories.filter((c) => !targetCatByName.has(c.name))
    const newProducts = src.products.filter((p) => !targetProductCodes.has(p.code))
    const newSettings = settingsToCopy.filter((s) => !targetSettingKeys.has(s.key))

    out('')
    out(`Categories : ${src.categories.length} in source → ${newCats.length} new, ${src.categories.length - newCats.length} already in target${args.overwrite ? ' (will be updated)' : ' (left as is)'}`)
    out(`Products   : ${src.products.length} in source → ${newProducts.length} new, ${src.products.length - newProducts.length} already in target${args.overwrite ? ' (will be updated)' : ' (left as is)'}`)
    out(`Scale step config (per category) : ${src.stepConfigs.length} in source`)
    out(`Settings   : ${settingsToCopy.length} to copy (${newSettings.length} new), ${settingsSkipped.length} skipped`)
    out('')
    out('Settings that will be copied:')
    for (const s of settingsToCopy) out(`  + ${s.key} = ${s.value.length > 60 ? s.value.slice(0, 57) + '...' : s.value}${targetSettingKeys.has(s.key) && !args.overwrite ? '   (exists in target — left as is)' : ''}`)
    out('Settings skipped:')
    for (const s of settingsSkipped) out(`  - ${s.key}   (${skipReason(s.key, args.exclude)})`)

    if (!args.apply) {
      out('\nDry run complete. Re-run with --apply to write.')
      return
    }

    // 3. Write everything to the target in ONE transaction.
    const result = await prisma.$transaction(async (tx) => {
      await pin(tx, target.id)

      // Categories, parents before children, remapping ids.
      const idMap = new Map<string, string>()            // source category id -> target category id
      for (const c of src.categories) {
        const existing = targetCatByName.get(c.name)
        if (existing) idMap.set(c.id, existing)
      }
      const byId = new Map(src.categories.map((c) => [c.id, c]))
      const depth = (c: (typeof src.categories)[number]): number => { let d = 0, p = c.parentId; while (p && byId.get(p)) { d++; p = byId.get(p)!.parentId } return d }
      for (const c of [...src.categories].sort((a, b) => depth(a) - depth(b))) {
        const parentId = c.parentId ? (idMap.get(c.parentId) ?? null) : null
        const data = { name: c.name, colorHex: c.colorHex, sortOrder: c.sortOrder, isActive: c.isActive, iconName: c.iconName, isTradeCommodity: c.isTradeCommodity, parentId }
        if (idMap.has(c.id)) {
          if (args.overwrite) await tx.productCategory.update({ where: { id: idMap.get(c.id)! }, data })
          continue
        }
        const id = randomUUID()
        await tx.productCategory.create({ data: { id, tenantId: target.id, ...data } })
        idMap.set(c.id, id)
      }

      // Scale Station per-category step config.
      let stepsCreated = 0
      for (const s of src.stepConfigs) {
        const categoryId = idMap.get(s.categoryId)
        if (!categoryId) continue
        const data = { requireWeight: s.requireWeight, requirePhotos: s.requirePhotos }
        if (targetStepCats.has(categoryId)) {
          if (args.overwrite) await tx.categoryStepConfig.update({ where: { categoryId }, data })
        } else {
          await tx.categoryStepConfig.create({ data: { id: randomUUID(), tenantId: target.id, categoryId, ...data } })
          stepsCreated++
        }
      }

      // Products (Decimal values are copied as-is, never through JS numbers).
      let productsCreated = 0, productsUpdated = 0
      for (const p of src.products) {
        const data = {
          name: p.name, category: p.category, categoryId: p.categoryId ? (idMap.get(p.categoryId) ?? null) : null,
          unit: p.unit, defaultBuyPrice: p.defaultBuyPrice, defaultSellPrice: p.defaultSellPrice,
          isActive: p.isActive, sortOrder: p.sortOrder, minStockLevel: p.minStockLevel, buyMarginPct: p.buyMarginPct,
        }
        if (targetProductCodes.has(p.code)) {
          if (args.overwrite) { await tx.product.update({ where: { tenantId_code: { tenantId: target.id, code: p.code } }, data }); productsUpdated++ }
        } else {
          await tx.product.create({ data: { id: randomUUID(), tenantId: target.id, code: p.code, ...data } })
          productsCreated++
        }
      }

      // Settings.
      let settingsWritten = 0
      for (const s of settingsToCopy) {
        if (targetSettingKeys.has(s.key) && !args.overwrite) continue
        await tx.systemSettings.upsert({
          where: { tenantId_key: { tenantId: target.id, key: s.key } },
          update: { value: s.value },
          create: { id: randomUUID(), tenantId: target.id, key: s.key, value: s.value },
        })
        settingsWritten++
      }
      return { categories: idMap.size - (src.categories.length - newCats.length), stepsCreated, productsCreated, productsUpdated, settingsWritten }
    }, { timeout: 120_000 })

    out(`\nDONE. Created ${result.categories} categories, ${result.stepsCreated} step configs, ${result.productsCreated} products (${result.productsUpdated} updated), wrote ${result.settingsWritten} settings.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
