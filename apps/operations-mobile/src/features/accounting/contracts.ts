/**
 * Historical M8 proposals retained for design reference; not runtime wire contracts.
 * Implemented accounting wire types live in packages/shared-types/accounting-*.ts
 * and packages/api-client/accounting-*.ts. Use those modules for actual API calls.
 */
import type { IsoDateTime, Uuid } from "@restaurant-platform/shared-types";

/** Server validates YYYY-MM-DD; ranges use restaurant-local calendar dates. */
export type ProposedLocalDate = string;
/** Base-10 string; never parse accounting values with Number/parseFloat. */
export type ProposedDecimal = string;

export interface ProposedMoney {
  /** Signed base-10 integer string, in currency units scaled by `scale`. */
  amountMinor: string;
  currency: string;
  scale: number;
}

export interface ProposedPeriod {
  fromDate: ProposedLocalDate;
  /** Exclusive local date, including for month/year reports. */
  toDate: ProposedLocalDate;
  timezone: string;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
}

export interface ProposedAccountingQuery {
  fromDate: ProposedLocalDate;
  toDate: ProposedLocalDate;
  granularity?: "DAY" | "MONTH" | "YEAR";
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ProposedSalesHistoryQuery extends ProposedAccountingQuery {
  orderStatus?: string;
  orderChannel?: string;
  paymentMethod?: "CASH_AT_COUNTER" | "CASH_ON_DELIVERY" | "ONLINE";
  paymentStatus?: string;
  refundStatus?: "NONE" | "PARTIAL" | "FULL";
}

export interface ProposedPage<T> {
  restaurantId: Uuid;
  items: T[];
  nextCursor: string | null;
}

export interface ProposedActorSnapshot {
  userId: Uuid | null;
  displayName: string | null;
  roleAtEvent: "OWNER" | "MANAGER" | "STAFF" | "DELIVERY_DRIVER" | null;
}

export interface ProposedAuditStamp {
  createdBy: ProposedActorSnapshot;
  createdAt: IsoDateTime;
  updatedBy: ProposedActorSnapshot;
  updatedAt: IsoDateTime;
  version: number;
}

export interface ProposedCorrectionRequest {
  expectedVersion: number;
  changeReason: string;
  effectiveDate: ProposedLocalDate;
}

export interface ProposedSalesBucket {
  period: ProposedPeriod;
  orderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  grossSales: ProposedMoney;
  discounts: ProposedMoney;
  salesReturns: ProposedMoney;
  netRecognizedRevenue: ProposedMoney;
  collectedCash: ProposedMoney;
  collectedNonCash: ProposedMoney;
  cashRefunds: ProposedMoney;
  nonCashRefunds: ProposedMoney;
}

export interface ProposedSalesDashboard {
  restaurantId: Uuid;
  period: ProposedPeriod;
  recognitionPolicy: string;
  policyVersion: string;
  generatedAt: IsoDateTime;
  totals: ProposedSalesBucket;
  buckets: ProposedSalesBucket[];
}

export interface ProposedSaleModifier {
  modifierOptionId: Uuid | null;
  nameSnapshot: string;
  quantity: ProposedDecimal;
  additionalUnitPrice: ProposedMoney;
}

export interface ProposedSaleLine {
  id: Uuid;
  productId: Uuid | null;
  variantId: Uuid | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  quantity: ProposedDecimal;
  unitPrice: ProposedMoney;
  modifiers: ProposedSaleModifier[];
  discount: ProposedMoney;
  lineTotal: ProposedMoney;
}

export interface ProposedSalePayment {
  id: Uuid;
  method: "CASH_AT_COUNTER" | "CASH_ON_DELIVERY" | "ONLINE";
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "PARTIALLY_REFUNDED" | "REFUNDED";
  amount: ProposedMoney;
  paidAt: IsoDateTime | null;
  collectedBy: ProposedActorSnapshot | null;
}

export interface ProposedRefund {
  id: Uuid;
  originalPaymentId: Uuid;
  originalSaleId: Uuid;
  amount: ProposedMoney;
  method: "CASH" | "NON_CASH";
  status: "PENDING" | "POSTED" | "FAILED" | "REVERSED";
  occurredAt: IsoDateTime;
  reason: string;
  actor: ProposedActorSnapshot;
  reversalOfId: Uuid | null;
}

export interface ProposedRefundRequest {
  originalPaymentId: Uuid;
  amount: ProposedMoney;
  reason: string;
  expectedPaymentVersion: number;
}

export interface ProposedSalesHistoryEntry {
  id: Uuid;
  restaurantId: Uuid;
  orderId: Uuid;
  orderNumber: string;
  saleDate: ProposedLocalDate;
  orderedAt: IsoDateTime;
  recognizedAt: IsoDateTime | null;
  orderType: string;
  orderChannel: string;
  orderStatus: string;
  cancellation: { cancelledAt: IsoDateTime; reason: string | null; actor: ProposedActorSnapshot } | null;
  refundStatus: "NONE" | "PARTIAL" | "FULL";
  createdBy: ProposedActorSnapshot;
  lines: ProposedSaleLine[];
  subtotal: ProposedMoney;
  deliveryFee: ProposedMoney;
  discount: ProposedMoney;
  total: ProposedMoney;
  payments: ProposedSalePayment[];
  refunds: ProposedRefund[];
}

export interface ProposedShoppingItem extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  name: string;
  defaultUnit: string;
  active: boolean;
  lastPurchasedOn: ProposedLocalDate | null;
  lastPurchasedAt: IsoDateTime | null;
  /** Suggestion only: no automatic catalog deletion or deactivation. */
  inactivitySuggestion: { inactiveDays: number; asOfDate: ProposedLocalDate } | null;
}

export interface ProposedShoppingItemRequest {
  name: string;
  defaultUnit: string;
  active: boolean;
  changeReason: string;
  expectedVersion?: number;
}

export interface ProposedPurchaseLine {
  id: Uuid;
  shoppingItemId: Uuid;
  itemNameSnapshot: string;
  quantity: ProposedDecimal;
  unit: string;
  unitCost: ProposedMoney;
  discount: ProposedMoney;
  lineTotal: ProposedMoney;
}

export interface ProposedReceiptAttachment {
  id: Uuid;
  filename: string;
  mediaType: string;
  byteLength: number;
  /** Tenant-checked, short-lived download route; never a public bucket URL. */
  expiresAt: IsoDateTime | null;
}

export interface ProposedPurchase extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  purchaseDate: ProposedLocalDate;
  purchasedAt: IsoDateTime;
  supplierId: Uuid | null;
  supplierNameSnapshot: string | null;
  supplierInvoiceNumber: string | null;
  dueDate: ProposedLocalDate | null;
  status: "DRAFT" | "POSTED" | "REVERSED";
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  lines: ProposedPurchaseLine[];
  total: ProposedMoney;
  amountPaid: ProposedMoney;
  outstanding: ProposedMoney;
  receipts: ProposedReceiptAttachment[];
  reversalOfId: Uuid | null;
}

export interface ProposedPurchaseRequest {
  purchaseDate: ProposedLocalDate;
  purchasedAt: IsoDateTime;
  supplierId: Uuid | null;
  supplierInvoiceNumber?: string | null;
  dueDate?: ProposedLocalDate | null;
  lines: { shoppingItemId: Uuid; quantity: ProposedDecimal; unit: string; unitCost: ProposedMoney; discount: ProposedMoney }[];
  changeReason: string;
  expectedVersion?: number;
}

export type ProposedExpenseCategory = "RENT" | "SALARIES" | "UTILITIES" | "TRANSPORT" | "PACKAGING" | "MAINTENANCE" | "OTHER";

export interface ProposedExpense extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  expenseDate: ProposedLocalDate;
  incurredAt: IsoDateTime;
  category: ProposedExpenseCategory;
  description: string;
  amount: ProposedMoney;
  status: "DRAFT" | "POSTED" | "REVERSED";
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  amountPaid: ProposedMoney;
  reversalOfId: Uuid | null;
}

export interface ProposedExpenseRequest {
  expenseDate: ProposedLocalDate;
  incurredAt: IsoDateTime;
  category: ProposedExpenseCategory;
  description: string;
  amount: ProposedMoney;
  changeReason: string;
  expectedVersion?: number;
}

export interface ProposedExpensePayment extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  expenseId: Uuid;
  paidAt: IsoDateTime;
  method: "CASH" | "BANK" | "OTHER_NON_CASH";
  amount: ProposedMoney;
  status: "POSTED" | "REVERSED";
  reversalOfId: Uuid | null;
}

export interface ProposedExpensePaymentRequest {
  paidAt: IsoDateTime;
  method: "CASH" | "BANK" | "OTHER_NON_CASH";
  amount: ProposedMoney;
  changeReason: string;
}

export interface ProposedCashMovement {
  id: Uuid;
  restaurantId: Uuid;
  cashAccountId: Uuid;
  occurredAt: IsoDateTime;
  direction: "IN" | "OUT";
  amount: ProposedMoney;
  sourceType: "SALE_PAYMENT" | "REFUND" | "PURCHASE_PAYMENT" | "EXPENSE_PAYMENT" | "TRANSFER" | "ADJUSTMENT";
  sourceId: Uuid;
  actor: ProposedActorSnapshot;
  reversalOfId: Uuid | null;
}

export interface ProposedCashAccount extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  name: string;
  type: "TILL" | "DRIVER_CUSTODY" | "SAFE";
  currency: string;
  scale: number;
  active: boolean;
}

export interface ProposedCashTransferRequest {
  fromAccountId: Uuid;
  toAccountId: Uuid;
  amount: ProposedMoney;
  occurredAt: IsoDateTime;
  changeReason: string;
}

export interface ProposedCashbookDay extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  cashAccountId: Uuid;
  date: ProposedLocalDate;
  period: ProposedPeriod;
  status: "OPEN" | "CLOSED" | "CORRECTED";
  openingBalance: ProposedMoney;
  cashReceived: ProposedMoney;
  cashPaidOut: ProposedMoney;
  expectedClosingCash: ProposedMoney;
  actualCountedCash: ProposedMoney | null;
  difference: ProposedMoney | null;
  closedAt: IsoDateTime | null;
  closedBy: ProposedActorSnapshot | null;
  closingId: Uuid | null;
  /** Prior immutable closing ID, not another cashbook day. */
  correctionOfId: Uuid | null;
}

export interface ProposedCashCloseRequest extends ProposedCorrectionRequest {
  actualCountedCash: ProposedMoney;
}

export interface ProposedCashOpenRequest {
  cashAccountId: Uuid;
  date: ProposedLocalDate;
  openingBalance: ProposedMoney;
  changeReason: string;
}

export type ProposedProfitAndLoss =
  | { status: "UNAVAILABLE"; reasons: string[] }
  | {
    status: "AVAILABLE";
    recognitionPolicy: string;
    costingMethod: string;
    dataCompleteThrough: IsoDateTime;
    netRevenue: ProposedMoney;
    costOfGoodsSold: ProposedMoney;
    grossProfit: ProposedMoney;
    operatingExpenses: ProposedMoney;
    operatingProfit: ProposedMoney;
  };

export interface ProposedFinancialReport {
  restaurantId: Uuid;
  period: ProposedPeriod;
  revenue: ProposedSalesBucket[];
  postedPurchases: ProposedMoney;
  purchasePayments: ProposedMoney;
  expensesByCategory: { category: ProposedExpenseCategory; amount: ProposedMoney }[];
  expensePayments: ProposedMoney;
  cashFlow: { cashIn: ProposedMoney; cashOut: ProposedMoney; nonCashIn: ProposedMoney; nonCashOut: ProposedMoney };
  profitAndLoss: ProposedProfitAndLoss;
  generatedAt: IsoDateTime;
}

export interface ProposedSupplier extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
}

export interface ProposedSupplierRequest {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  active: boolean;
  changeReason: string;
  expectedVersion?: number;
}

export interface ProposedPurchasePayment extends ProposedAuditStamp {
  id: Uuid;
  restaurantId: Uuid;
  supplierId: Uuid | null;
  paidAt: IsoDateTime;
  method: "CASH" | "BANK" | "OTHER_NON_CASH";
  amount: ProposedMoney;
  status: "POSTED" | "REVERSED";
  allocations: { purchaseId: Uuid; amount: ProposedMoney }[];
  reversalOfId: Uuid | null;
}

export interface ProposedSupplierPayment extends ProposedPurchasePayment {
  supplierId: Uuid;
}

export interface ProposedPurchasePaymentRequest {
  paidAt: IsoDateTime;
  method: "CASH" | "BANK" | "OTHER_NON_CASH";
  amount: ProposedMoney;
  changeReason: string;
}

export interface ProposedSupplierPaymentRequest {
  paidAt: IsoDateTime;
  method: "CASH" | "BANK" | "OTHER_NON_CASH";
  amount: ProposedMoney;
  allocations: { purchaseId: Uuid; amount: ProposedMoney }[];
  changeReason: string;
}

export interface ProposedSupplierStatement {
  restaurantId: Uuid;
  supplierId: Uuid;
  period: ProposedPeriod;
  openingOutstanding: ProposedMoney;
  postedPurchases: ProposedMoney;
  amountPaid: ProposedMoney;
  adjustments: ProposedMoney;
  closingOutstanding: ProposedMoney;
}

export interface ProposedAuditEvent {
  id: Uuid;
  restaurantId: Uuid;
  entityType: string;
  entityId: Uuid;
  actor: ProposedActorSnapshot;
  occurredAt: IsoDateTime;
  action: "CREATE" | "UPDATE" | "POST" | "REVERSE" | "CORRECT" | "CLOSE" | "EXPORT";
  changeReason: string;
  changedFields: string[];
  previousVersion: number | null;
  resultingVersion: number;
  reversalOfId: Uuid | null;
  correctionOfId: Uuid | null;
  requestId: string;
}

export interface ProposedAccountingCapabilities {
  restaurantId: Uuid;
  userId: Uuid;
  role: "OWNER" | "MANAGER";
  schemaVersion: string;
  permissions: string[];
  features: {
    salesDashboard: boolean;
    salesHistory: boolean;
    shopping: boolean;
    purchases: boolean;
    expenses: boolean;
    cashbook: boolean;
    financialReports: boolean;
    suppliers: boolean;
    audit: boolean;
  };
}

export interface ProposedCsvExportQuery extends ProposedAccountingQuery {
  report: "SALES" | "PURCHASES" | "EXPENSES" | "CASH_FLOW" | "SUPPLIER_STATEMENT";
  supplierId?: Uuid;
}
