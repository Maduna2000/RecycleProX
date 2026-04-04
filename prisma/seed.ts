import { PrismaClient, ProductCategory, UnitOfMeasure } from '@prisma/client'
import bcrypt from 'bcryptjs'
import Decimal from 'decimal.js'

const prisma = new PrismaClient()

const PRODUCTS: Array<{
  code: string; name: string; category: ProductCategory
  unit: UnitOfMeasure; defaultBuyPrice: string; defaultSellPrice: string; sortOrder: number
}> = [
  // Ferrous
  { code: 'FE-STEEL-MIX', name: 'Mixed Steel', category: 'ferrous', unit: 'kg', defaultBuyPrice: '1.20', defaultSellPrice: '2.10', sortOrder: 1 },
  { code: 'FE-CAST-IRON', name: 'Cast Iron', category: 'ferrous', unit: 'kg', defaultBuyPrice: '0.90', defaultSellPrice: '1.80', sortOrder: 2 },
  { code: 'FE-PLATE', name: 'Plate Steel', category: 'ferrous', unit: 'kg', defaultBuyPrice: '1.30', defaultSellPrice: '2.20', sortOrder: 3 },
  { code: 'FE-REBAR', name: 'Rebar / Reinforcing', category: 'ferrous', unit: 'kg', defaultBuyPrice: '1.10', defaultSellPrice: '2.00', sortOrder: 4 },
  { code: 'FE-PIPE', name: 'Steel Pipe', category: 'ferrous', unit: 'kg', defaultBuyPrice: '1.15', defaultSellPrice: '2.05', sortOrder: 5 },
  { code: 'FE-ENGINE', name: 'Engine Block', category: 'ferrous', unit: 'kg', defaultBuyPrice: '0.80', defaultSellPrice: '1.60', sortOrder: 6 },
  { code: 'FE-SPRING', name: 'Car Springs', category: 'ferrous', unit: 'kg', defaultBuyPrice: '1.00', defaultSellPrice: '1.90', sortOrder: 7 },
  { code: 'FE-DRUM', name: 'Steel Drums / Barrels', category: 'ferrous', unit: 'kg', defaultBuyPrice: '0.95', defaultSellPrice: '1.85', sortOrder: 8 },

  // Copper
  { code: 'CU-WIRE-BRIGHT', name: 'Bright Copper Wire', category: 'copper', unit: 'kg', defaultBuyPrice: '80.00', defaultSellPrice: '95.00', sortOrder: 10 },
  { code: 'CU-WIRE-BURNT', name: 'Burnt Copper Wire', category: 'copper', unit: 'kg', defaultBuyPrice: '60.00', defaultSellPrice: '75.00', sortOrder: 11 },
  { code: 'CU-PIPE', name: 'Copper Pipe', category: 'copper', unit: 'kg', defaultBuyPrice: '75.00', defaultSellPrice: '90.00', sortOrder: 12 },
  { code: 'CU-MOTOR', name: 'Copper Motor Windings', category: 'copper', unit: 'kg', defaultBuyPrice: '55.00', defaultSellPrice: '70.00', sortOrder: 13 },
  { code: 'CU-BUS-BAR', name: 'Copper Bus Bar', category: 'copper', unit: 'kg', defaultBuyPrice: '82.00', defaultSellPrice: '97.00', sortOrder: 14 },
  { code: 'CU-TRANSFORMER', name: 'Transformer Copper', category: 'copper', unit: 'kg', defaultBuyPrice: '65.00', defaultSellPrice: '80.00', sortOrder: 15 },

  // Non-Ferrous (misc)
  { code: 'NF-STAINLESS', name: 'Stainless Steel 304', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '8.00', defaultSellPrice: '12.00', sortOrder: 20 },
  { code: 'NF-STAINLESS-316', name: 'Stainless Steel 316', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '10.00', defaultSellPrice: '15.00', sortOrder: 21 },
  { code: 'NF-BRASS-CLEAN', name: 'Clean Brass', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '45.00', defaultSellPrice: '58.00', sortOrder: 22 },
  { code: 'NF-BRASS-MIX', name: 'Mixed Brass', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '38.00', defaultSellPrice: '50.00', sortOrder: 23 },
  { code: 'NF-BRONZE', name: 'Bronze', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '42.00', defaultSellPrice: '55.00', sortOrder: 24 },
  { code: 'NF-LEAD', name: 'Lead', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '12.00', defaultSellPrice: '18.00', sortOrder: 25 },
  { code: 'NF-ZINC', name: 'Zinc', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '14.00', defaultSellPrice: '20.00', sortOrder: 26 },
  { code: 'NF-BATTERY', name: 'Car Battery (Wet)', category: 'non_ferrous', unit: 'each', defaultBuyPrice: '85.00', defaultSellPrice: '120.00', sortOrder: 27 },
  { code: 'NF-BATTERY-DRY', name: 'Dry Battery / UPS', category: 'non_ferrous', unit: 'kg', defaultBuyPrice: '5.00', defaultSellPrice: '9.00', sortOrder: 28 },

  // Aluminium
  { code: 'AL-CLEAN', name: 'Clean Aluminium', category: 'aluminium', unit: 'kg', defaultBuyPrice: '18.00', defaultSellPrice: '25.00', sortOrder: 30 },
  { code: 'AL-CAST', name: 'Cast Aluminium', category: 'aluminium', unit: 'kg', defaultBuyPrice: '12.00', defaultSellPrice: '18.00', sortOrder: 31 },
  { code: 'AL-EXTRUSION', name: 'Aluminium Extrusions', category: 'aluminium', unit: 'kg', defaultBuyPrice: '16.00', defaultSellPrice: '23.00', sortOrder: 32 },
  { code: 'AL-SHEET', name: 'Aluminium Sheet', category: 'aluminium', unit: 'kg', defaultBuyPrice: '15.00', defaultSellPrice: '22.00', sortOrder: 33 },
  { code: 'AL-RIMS', name: 'Aluminium Rims', category: 'aluminium', unit: 'kg', defaultBuyPrice: '14.00', defaultSellPrice: '20.00', sortOrder: 34 },
  { code: 'AL-CANS', name: 'Aluminium Cans (crushed)', category: 'aluminium', unit: 'kg', defaultBuyPrice: '10.00', defaultSellPrice: '16.00', sortOrder: 35 },
  { code: 'AL-WIRE', name: 'Aluminium Wire', category: 'aluminium', unit: 'kg', defaultBuyPrice: '13.00', defaultSellPrice: '19.00', sortOrder: 36 },

  // Plastic
  { code: 'PL-PET-CLEAR', name: 'PET Clear Bottles', category: 'plastic', unit: 'kg', defaultBuyPrice: '2.50', defaultSellPrice: '4.50', sortOrder: 40 },
  { code: 'PL-PET-COLOR', name: 'PET Coloured Bottles', category: 'plastic', unit: 'kg', defaultBuyPrice: '1.80', defaultSellPrice: '3.20', sortOrder: 41 },
  { code: 'PL-HDPE', name: 'HDPE (Milk / Detergent)', category: 'plastic', unit: 'kg', defaultBuyPrice: '2.20', defaultSellPrice: '4.00', sortOrder: 42 },
  { code: 'PL-LDPE', name: 'LDPE Film / Bags', category: 'plastic', unit: 'kg', defaultBuyPrice: '1.50', defaultSellPrice: '2.80', sortOrder: 43 },
  { code: 'PL-PP', name: 'Polypropylene', category: 'plastic', unit: 'kg', defaultBuyPrice: '1.80', defaultSellPrice: '3.20', sortOrder: 44 },
  { code: 'PL-PS', name: 'Polystyrene (hard)', category: 'plastic', unit: 'kg', defaultBuyPrice: '0.80', defaultSellPrice: '1.80', sortOrder: 45 },

  // Paper
  { code: 'PA-CARDBOARD', name: 'Cardboard / OCC', category: 'paper', unit: 'kg', defaultBuyPrice: '0.90', defaultSellPrice: '1.60', sortOrder: 50 },
  { code: 'PA-NEWSPAPER', name: 'Newspaper / ONP', category: 'paper', unit: 'kg', defaultBuyPrice: '0.50', defaultSellPrice: '1.00', sortOrder: 51 },
  { code: 'PA-WHITE-OFFICE', name: 'White Office Paper', category: 'paper', unit: 'kg', defaultBuyPrice: '1.20', defaultSellPrice: '2.20', sortOrder: 52 },
  { code: 'PA-MAGAZINE', name: 'Magazines / Catalogues', category: 'paper', unit: 'kg', defaultBuyPrice: '0.40', defaultSellPrice: '0.90', sortOrder: 53 },

  // E-Waste
  { code: 'EW-BOARD-CPU', name: 'CPU Boards / Motherboards', category: 'e_waste', unit: 'kg', defaultBuyPrice: '45.00', defaultSellPrice: '70.00', sortOrder: 60 },
  { code: 'EW-RAM', name: 'RAM Modules', category: 'e_waste', unit: 'kg', defaultBuyPrice: '80.00', defaultSellPrice: '110.00', sortOrder: 61 },
  { code: 'EW-HDD', name: 'Hard Drives', category: 'e_waste', unit: 'kg', defaultBuyPrice: '20.00', defaultSellPrice: '35.00', sortOrder: 62 },
  { code: 'EW-WIRE-MIX', name: 'Mixed E-Waste Wire', category: 'e_waste', unit: 'kg', defaultBuyPrice: '8.00', defaultSellPrice: '14.00', sortOrder: 63 },
  { code: 'EW-PHONE', name: 'Mobile Phones', category: 'e_waste', unit: 'each', defaultBuyPrice: '20.00', defaultSellPrice: '40.00', sortOrder: 64 },
]

async function main() {
  console.log('Seeding products...')

  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        category: p.category,
        unit: p.unit,
        defaultBuyPrice: new Decimal(p.defaultBuyPrice),
        defaultSellPrice: new Decimal(p.defaultSellPrice),
        sortOrder: p.sortOrder,
      },
      update: {
        name: p.name,
        category: p.category,
        unit: p.unit,
        defaultBuyPrice: new Decimal(p.defaultBuyPrice),
        defaultSellPrice: new Decimal(p.defaultSellPrice),
        sortOrder: p.sortOrder,
      },
    })
  }
  console.log(`Seeded ${PRODUCTS.length} products`)

  // Seed default admin if not exists
  const adminExists = await prisma.user.findFirst({ where: { role: 'admin' } })
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin@1234', 12)
    await prisma.user.create({
      data: {
        fullName: 'System Administrator',
        username: 'admin',
        passwordHash,
        role: 'admin',
        forcePasswordChange: true,
      },
    })
    console.log('Seeded default admin (username: admin, password: Admin@1234)')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
