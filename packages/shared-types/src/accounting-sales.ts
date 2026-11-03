/** Whole currency values are decimal strings; retain exact values beyond JavaScript's safe integer range. */
export type AccountingWhole = string;
export interface SalesSummary {
  from: string; to: string; grossSales: AccountingWhole; discounts: AccountingWhole; netSales: AccountingWhole;
  collectedPayments: AccountingWhole; outstandingPayments: AccountingWhole; refundedAmounts: AccountingWhole;
  orders: number; cancelledOrders: number; productsSold: number; legacyRefundsWithoutEventTime: AccountingWhole;
}
export interface SalesTrend { period: string; grossSales: AccountingWhole; discounts: AccountingWhole; netSales: AccountingWhole; orders: number; productsSold: number; }
export interface SalesProduct { productId: string; historicalName: string; quantity: number; lineSalesBeforeOrderDiscounts: AccountingWhole; }
export interface SalesDashboard {
  timezone: string; currency: string; today: SalesSummary; selectedDay: SalesSummary; selectedMonth: SalesSummary; selectedYear: SalesSummary;
  dailyTrend: SalesTrend[]; monthlyTrend: SalesTrend[]; topProducts: SalesProduct[]; definitions: Record<string,string>; missingInputs: string[];
}
export interface SalesModifier { optionId: string; name: string; additionalPrice: AccountingWhole; quantity: number; }
export interface SalesLine { id: string; productId: string; productName: string; variantId: string|null; variantName: string|null; quantity: number; unitPrice: AccountingWhole; lineDiscount: AccountingWhole; lineTotal: AccountingWhole; modifiers: SalesModifier[]; }
export interface SalesPayment { id: string; method: string; status: string; amount: AccountingWhole; paidAt: string|null; collectedByUserId: string|null; createdAt: string; }
export interface SalesRefund { id: string; orderId: string; paymentId: string; amount: AccountingWhole; method: string; refundedAt: string; createdBy: string; createdAt: string; reason: string; }
export interface SalesRefundReversal { id: string; orderId: string; refundId: string; amount: AccountingWhole; method: string; createdBy: string; createdAt: string; reason: string; }
export interface SalesEvent { type: string; timestamp: string; actor: string|null; amount: AccountingWhole|null; description: string|null; }
export interface SalesLedgerOrder {
  id: string; orderNumber: string; createdAt: string; createdByUserId: string|null; orderChannel: string; orderType: string; status: string;
  tableId: string|null; tableNumber: string|null; queueTicketId: string|null; queueDisplayCode: string|null;
  subtotal: AccountingWhole; deliveryFee: AccountingWhole; discountAmount: AccountingWhole; totalAmount: AccountingWhole;
  paymentStatus: string; lines: SalesLine[]; payments: SalesPayment[]; refunds: SalesRefund[]; refundReversals: SalesRefundReversal[]; timeline: SalesEvent[];
}
export interface SalesLedgerPage<T> { content: T[]; page: number; size: number; totalElements: number; }
export interface SalesRefundRequest { paymentId: string; amount: AccountingWhole; refundedAt: string; reason: string; }
export interface SalesPeriodQuery { date?: string; month?: string; from?: string; to?: string; }
export type SalesLedgerSort = "NEWEST" | "OLDEST" | "HIGHEST_TOTAL";
export type SalesProductSort = "MOST_SOLD" | "HIGHEST_SALES" | "NAME";
export interface SalesLedgerQuery extends SalesPeriodQuery { product?: string; order?: string; paymentStatus?: string; channel?: string; sort?: SalesLedgerSort; page?: number; size?: number; }
export interface SalesProductsQuery extends SalesPeriodQuery { search?: string; sort?: SalesProductSort; page?: number; size?: number; }
