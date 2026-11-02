/** Accounting totals are exact whole-currency decimal strings. */
export interface FinancialSalesSummary {
  from: string; to: string; grossSales: string; discounts: string; netSales: string;
  collectedPayments: string; outstandingPayments: string; refundedAmounts: string;
  orders: number; cancelledOrders: number; productsSold: number; legacyRefundsWithoutEventTime: string;
}
export interface FinancialReport {
  restaurantId: string; from: string; to: string; timezone: string; currency: string;
  reportType: "CASH_FLOW_AND_EXPENSE_SUMMARY"; sales: FinancialSalesSummary;
  confirmedPurchases: string; registeredOperatingExpenses: string;
  purchasePayments: string; expensePayments: string; tradingPaymentNet: string;
  expensesByCategory: { category: string; amount: string }[];
  costOfGoodsSold: null; grossProfit: null; netOperatingProfit: null; missingInputs: string[];
}
export interface AccountingAuditEntry {
  id: string; actorId: string; entityType: string; entityId: string; action: string;
  reason: string | null; detailJson: string; createdAt: string;
}
export interface AccountingAuditPage { content: AccountingAuditEntry[]; totalElements: number; page: number; size: number; }
