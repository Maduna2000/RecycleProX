/**
 * Server-side report registry — maps report ids (from the client-safe
 * catalog) to their params schema and data builder. The dynamic API route
 * consumes this; adding a report = one builder + one entry here + one
 * catalog entry.
 */
import type { z } from 'zod'
import type { ReportDocument, ReportMeta } from '@/lib/reports/types'
import { REPORT_CATALOG } from '@/lib/reports/catalog'
import {
  BaseReportParamsSchema,
  PurchasesByProductCategoryParamsSchema,
  PurchasesDailyParamsSchema,
  PurchasesSupplierStatementParamsSchema,
  PurchasesPerProductDayParamsSchema,
  PurchasesByIdSearchParamsSchema,
  TopSellersParamsSchema,
  SalesDailyParamsSchema,
  SalesByProductParamsSchema,
  SalesByCustomerParamsSchema,
  ExpensesReportParamsSchema,
  LoanBookParamsSchema,
  LoansOutstandingParamsSchema,
  LoanPaymentsParamsSchema,
  StockOnHandParamsSchema,
  StockMovementParamsSchema,
  StocktakeReportParamsSchema,
  PoliceCopperReportParamsSchema,
} from '@/lib/schemas/report'
import {
  buildPurchasesByProductCategory,
  buildPurchasesDaily,
  buildPurchasesSupplierStatement,
  buildPurchasesPerProductDay,
  buildPurchasesByCasualId,
  buildPurchasesByAccountId,
  buildTopSellersByCategory,
} from './builders/purchases'
import {
  buildSalesDaily,
  buildSalesByProduct,
  buildSalesByCustomer,
} from './builders/sales'
import {
  buildCashupHistory,
  buildExpensesReport,
  buildFloatLog,
  buildCashOnHand,
  buildLoanBook,
  buildLoansOutstanding,
  buildLoanPayments,
  buildProfitSummary,
  buildVatSummary,
  buildCancelledTransactions,
} from './builders/cash'
import { buildStockOnHand, buildStockMovement } from './builders/stock'
import { buildStocktakeReport } from './builders/stocktake'
import { buildDealersPriceList, buildAccountList, buildCasualList } from './builders/accounts'
import {
  buildPoliceRegisterReport,
  buildPoliceCopperReport,
  buildPoliceCopperReportImages,
} from './builders/police'

type MetaBase = Omit<ReportMeta, 'rowCount'>

export interface ReportDefinition {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paramsSchema: z.ZodType<any, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (params: any, meta: MetaBase) => Promise<ReportDocument>
}

export const REPORT_REGISTRY: Record<string, ReportDefinition> = {
  'purchases-by-product-category': {
    paramsSchema: PurchasesByProductCategoryParamsSchema,
    build: buildPurchasesByProductCategory,
  },
  'purchases-daily': {
    paramsSchema: PurchasesDailyParamsSchema,
    build: buildPurchasesDaily,
  },
  'purchases-supplier-statement': {
    paramsSchema: PurchasesSupplierStatementParamsSchema,
    build: buildPurchasesSupplierStatement,
  },
  'purchases-per-product-day': {
    paramsSchema: PurchasesPerProductDayParamsSchema,
    build: buildPurchasesPerProductDay,
  },
  'sales-daily': {
    paramsSchema: SalesDailyParamsSchema,
    build: buildSalesDaily,
  },
  'sales-by-product': {
    paramsSchema: SalesByProductParamsSchema,
    build: buildSalesByProduct,
  },
  'sales-by-customer': {
    paramsSchema: SalesByCustomerParamsSchema,
    build: buildSalesByCustomer,
  },
  'cashup-history': {
    paramsSchema: BaseReportParamsSchema,
    build: buildCashupHistory,
  },
  'expenses': {
    paramsSchema: ExpensesReportParamsSchema,
    build: buildExpensesReport,
  },
  'float-log': {
    paramsSchema: BaseReportParamsSchema,
    build: buildFloatLog,
  },
  'cash-on-hand': {
    paramsSchema: BaseReportParamsSchema,
    build: buildCashOnHand,
  },
  'loan-book': {
    paramsSchema: LoanBookParamsSchema,
    build: buildLoanBook,
  },
  'loans-outstanding': {
    paramsSchema: LoansOutstandingParamsSchema,
    build: buildLoansOutstanding,
  },
  'loan-payments': {
    paramsSchema: LoanPaymentsParamsSchema,
    build: buildLoanPayments,
  },
  'profit-summary': {
    paramsSchema: BaseReportParamsSchema,
    build: buildProfitSummary,
  },
  'vat-summary': {
    paramsSchema: BaseReportParamsSchema,
    build: buildVatSummary,
  },
  'cancelled-transactions': {
    paramsSchema: BaseReportParamsSchema,
    build: buildCancelledTransactions,
  },
  'stock-on-hand': {
    paramsSchema: StockOnHandParamsSchema,
    build: buildStockOnHand,
  },
  'stock-movement': {
    paramsSchema: StockMovementParamsSchema,
    build: buildStockMovement,
  },
  'stocktake-report': {
    paramsSchema: StocktakeReportParamsSchema,
    build: buildStocktakeReport,
  },
  'dealers-price-list': {
    paramsSchema: BaseReportParamsSchema,
    build: buildDealersPriceList,
  },
  'account-list': {
    paramsSchema: BaseReportParamsSchema,
    build: buildAccountList,
  },
  'casual-list': {
    paramsSchema: BaseReportParamsSchema,
    build: buildCasualList,
  },
  'purchases-by-casual-id': {
    paramsSchema: PurchasesByIdSearchParamsSchema,
    build: buildPurchasesByCasualId,
  },
  'purchases-by-account-id': {
    paramsSchema: PurchasesByIdSearchParamsSchema,
    build: buildPurchasesByAccountId,
  },
  'top-sellers-by-category': {
    paramsSchema: TopSellersParamsSchema,
    build: buildTopSellersByCategory,
  },
  'police-register': {
    paramsSchema: BaseReportParamsSchema,
    build: buildPoliceRegisterReport,
  },
  'police-copper-report': {
    paramsSchema: PoliceCopperReportParamsSchema,
    build: buildPoliceCopperReport,
  },
  'police-copper-report-images': {
    paramsSchema: PoliceCopperReportParamsSchema,
    build: buildPoliceCopperReportImages,
  },
}

// Every catalog entry must have a registry implementation — fail fast at
// module load (build/boot time) rather than 404ing at request time.
for (const entry of REPORT_CATALOG) {
  if (!REPORT_REGISTRY[entry.id]) {
    throw new Error(`Report catalog entry "${entry.id}" has no registry implementation`)
  }
}
