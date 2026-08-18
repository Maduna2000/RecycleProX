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
  PurchasesAverageCostParamsSchema,
  PurchasesSplitPaymentsParamsSchema,
  PurchasesByIdSearchParamsSchema,
  TopSellersParamsSchema,
  SellerIdUploadStatusParamsSchema,
  SalesDailyParamsSchema,
  SalesByProductParamsSchema,
  SalesByCustomerParamsSchema,
  SalesSplitPaymentsParamsSchema,
  ExpensesReportParamsSchema,
  LoansOutstandingParamsSchema,
  LoanPaymentsParamsSchema,
  CashupSnapshotParamsSchema,
  StockOnHandParamsSchema,
  StockMovementParamsSchema,
  StocktakeReportParamsSchema,
  PoliceCopperReportParamsSchema,
  ScaleDiscrepancyParamsSchema,
} from '@/lib/schemas/report'
import {
  buildPurchasesByProductCategory,
  buildPurchasesDaily,
  buildPurchasesSupplierStatement,
  buildPurchasesPerProductDay,
  buildPurchasesAverageCost,
  buildPurchasesSplitPayments,
  buildPurchasesByCasualId,
  buildPurchasesByAccountId,
  buildTopSellersByCategory,
} from './builders/purchases'
import {
  buildSalesDaily,
  buildSalesByProduct,
  buildSalesByCustomer,
  buildSalesSplitPayments,
} from './builders/sales'
import {
  buildCashupHistory,
  buildExpensesReport,
  buildFloatLog,
  buildCashOnHand,
  buildLoansOutstanding,
  buildLoanPayments,
  buildProfitSummary,
  buildVatSummary,
  buildCancelledTransactions,
  buildCashupSnapshot,
} from './builders/cash'
import { buildStockOnHand, buildStockMovement } from './builders/stock'
import { buildStocktakeReport } from './builders/stocktake'
import { buildScaleDiscrepancy } from './builders/scale'
import { buildDealersPriceList, buildAccountList, buildAccountIdUploadStatus, buildCasualList, buildCasualIdUploadStatus, buildSellerIdUploadStatus } from './builders/accounts'
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
  'purchases-average-cost': {
    paramsSchema: PurchasesAverageCostParamsSchema,
    build: buildPurchasesAverageCost,
  },
  'purchases-split-payments': {
    paramsSchema: PurchasesSplitPaymentsParamsSchema,
    build: buildPurchasesSplitPayments,
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
  'sales-split-payments': {
    paramsSchema: SalesSplitPaymentsParamsSchema,
    build: buildSalesSplitPayments,
  },
  'cashup-history': {
    paramsSchema: BaseReportParamsSchema,
    build: buildCashupHistory,
  },
  'cashup-snapshot': {
    paramsSchema: CashupSnapshotParamsSchema,
    build: buildCashupSnapshot,
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
  'scale-purchase-discrepancy': {
    paramsSchema: ScaleDiscrepancyParamsSchema,
    build: buildScaleDiscrepancy,
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
  'account-id-status': {
    paramsSchema: BaseReportParamsSchema,
    build: buildAccountIdUploadStatus,
  },
  'casual-list': {
    paramsSchema: BaseReportParamsSchema,
    build: buildCasualList,
  },
  'casual-id-status': {
    paramsSchema: BaseReportParamsSchema,
    build: buildCasualIdUploadStatus,
  },
  'seller-id-status-by-period': {
    paramsSchema: SellerIdUploadStatusParamsSchema,
    build: buildSellerIdUploadStatus,
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
