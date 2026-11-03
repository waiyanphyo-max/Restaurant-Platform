import type { AccountingChronology } from "@restaurant-platform/shared-types";
import type { RestaurantMemberApiClientOptions } from "./clients.js";
import { ApiConfigurationError } from "./errors.js";
import { requireHeaderValue, requireUuid } from "./tenant.js";
import { createAuthenticatedTransport, type ApiRequestOptions } from "./transport.js";

/** Whole-currency integer strings preserve PostgreSQL BIGINT precision. */
export type ExpenseMoney = string;
export type ExpenseCategory = "RENT" | "SALARIES_WAGES" | "ELECTRICITY" | "WATER" | "INTERNET" | "TRANSPORT" | "PACKAGING" | "EQUIPMENT_MAINTENANCE" | "MARKETING" | "MISCELLANEOUS";
export type ExpensePaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
export interface ExpensePage<T> { items: T[]; total: number; page: number; size: number; }
export interface ExpenseRecord {
  id: string; category: ExpenseCategory; amount: ExpenseMoney; expenseDate: string; description: string;
  payee: string | null; receiptId: string | null; templateId: string | null; paidAmount: ExpenseMoney;
  outstandingAmount: ExpenseMoney; paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  recordedBy: string; createdAt: string; cancelledAt: string | null; cancellationReason: string | null; cancelledBy: string | null;
}
export interface ExpensePayment {
  id: string; amount: ExpenseMoney; method: ExpensePaymentMethod; paidAt: string; recordedBy: string; createdAt: string;
  reversedAt: string | null; reversalReason: string | null; reversedBy: string | null;
}
export interface ExpenseDetail { expense: ExpenseRecord; payments: ExpensePayment[]; }
export interface ExpenseCreate { category: ExpenseCategory; amount: ExpenseMoney; expenseDate: string; description: string; payee?: string | null; receiptId?: string | null; }
export interface ExpenseCorrection { replacement: ExpenseCreate; reason: string; }
export interface ExpensePay { amount: ExpenseMoney; method: ExpensePaymentMethod; paidAt: string; }
export interface ExpenseQuery { from?: string; to?: string; category?: ExpenseCategory; search?: string; paymentStatus?: ExpenseRecord["paymentStatus"]; sort?: AccountingChronology; page?: number; size?: number; }
export interface ExpenseReport {
  from: string; to: string; period: "DAY" | "MONTH" | "YEAR";
  totals: { periodStart: string; category: ExpenseCategory; postedAmount: ExpenseMoney; cancelledAmount: ExpenseMoney; expenseAmount: ExpenseMoney }[];
}
export interface ExpenseTemplateCreate { category: ExpenseCategory; amount: ExpenseMoney; description: string; payee?: string | null; frequency: "MONTHLY" | "YEARLY"; startsOn: string; }
export interface ExpenseTemplate extends ExpenseTemplateCreate { id: string; active: boolean; recordedBy: string; createdAt: string; }
export type CashMovementKind = "OTHER_RECEIPT" | "OWNER_DEPOSIT" | "OWNER_WITHDRAWAL" | "BANK_DEPOSIT" | "BANK_WITHDRAWAL" | "ADJUSTMENT";
export interface CashMovementCreate { kind: CashMovementKind; direction: "IN" | "OUT"; amount: ExpenseMoney; occurredAt: string; reason: string; }
export interface CashClosing {
  id: string; date: string; revision: number; openingBalance: ExpenseMoney; expectedCash: ExpenseMoney; actualCash: ExpenseMoney;
  variance: ExpenseMoney; responsibleMember: string; closedAt: string; reversedAt: string | null; reversalReason: string | null; reversedBy: string | null; reconciliationNote: string | null;
}
export interface CashbookDay {
  date: string; timezone: string; openingBalance: ExpenseMoney | null; cashSalesReceived: ExpenseMoney;
  cashRefundsPaid: ExpenseMoney; cashPurchasePayments: ExpenseMoney; cashExpensePayments: ExpenseMoney;
  otherReceipts: ExpenseMoney; otherPayments: ExpenseMoney; expectedClosingCash: ExpenseMoney | null; closing: CashClosing | null; missingInputs: string[];
}
export interface CashbookTransaction { id: string; source: string; sourceId: string; occurredAt: string; signedAmount: ExpenseMoney; recordedBy: string | null; description: string; }
export interface CashbookQuery { from?: string; to?: string; sort?: AccountingChronology; page?: number; size?: number; }
export interface CashbookTransactionQuery extends CashbookQuery { search?: string; }
export interface CashbookClose { date: string; actualCash: ExpenseMoney; expectedCash?: ExpenseMoney; acknowledgeMissingInputs?: boolean; reconciliationReason?: string; }

function amount(value: string, zero = false) {
  if (!/^(0|[1-9]\d*)$/.test(value) || BigInt(value) > 9223372036854775807n || (!zero && value === "0")) throw new ApiConfigurationError("Enter a whole-currency amount within the supported range");
}
function expectedCash(value: string) {
  if (!/^-?(0|[1-9]\d*)$/.test(value) || BigInt(value) < -9223372036854775808n || BigInt(value) > 9223372036854775807n) throw new ApiConfigurationError("Invalid reviewed cash amount");
}
function date(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ApiConfigurationError("Enter a valid YYYY-MM-DD date");
}
function range<T extends CashbookQuery>(query: T) {
  if (query.from) date(query.from); if (query.to) date(query.to);
  if (query.from && query.to && query.to < query.from) throw new ApiConfigurationError("Date range must be chronological");
  if (query.page !== undefined && (!Number.isInteger(query.page) || query.page < 0) || query.size !== undefined && (!Number.isInteger(query.size) || query.size < 1 || query.size > 200)) throw new ApiConfigurationError("Invalid accounting page");
  return { ...query };
}
function timestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiConfigurationError("Use an exact timestamp with its timezone offset");
}
export function createExpenseCashApiClient(options: RestaurantMemberApiClientOptions) {
  const restaurantId = requireUuid(options.restaurantId, "restaurantId");
  const transport = createAuthenticatedTransport(options), prefix = `/api/v1/restaurants/${restaurantId}/accounting`;
  function read<T>(path: string, query: Record<string, string | number | undefined> = {}, o?: ApiRequestOptions) {
    return transport.request<T>({ method: "GET", path: `${prefix}${path}`, query, options: o, retryTransient: true });
  }
  function post<T>(path: string, body: unknown, key: string, o?: ApiRequestOptions) {
    return transport.request<T>({ method: "POST", path: `${prefix}${path}`, body, headers: { "Idempotency-Key": requireHeaderValue(key, "Idempotency-Key") }, options: o, retryTransient: true });
  }
  const id = (value: string) => requireUuid(value, "financialRecordId");
  return {
    listExpenses: (query: ExpenseQuery = {}, o?: ApiRequestOptions) => { range(query); return read<ExpensePage<ExpenseRecord>>("/expenses", { ...query }, o); },
    getExpense: (expenseId: string, o?: ApiRequestOptions) => read<ExpenseDetail>(`/expenses/${id(expenseId)}`, {}, o),
    createExpense: (body: ExpenseCreate, key: string, o?: ApiRequestOptions) => { amount(body.amount); date(body.expenseDate); return post<ExpenseRecord>("/expenses", body, key, o); },
    payExpense: (expenseId: string, body: ExpensePay, key: string, o?: ApiRequestOptions) => { amount(body.amount); timestamp(body.paidAt); return post<ExpenseDetail>(`/expenses/${id(expenseId)}/payments`, body, key, o); },
    reverseExpensePayment: (expenseId: string, paymentId: string, reason: string, key: string, o?: ApiRequestOptions) => post<ExpenseDetail>(`/expenses/${id(expenseId)}/payments/${id(paymentId)}/reverse`, { reason }, key, o),
    cancelExpense: (expenseId: string, reason: string, key: string, o?: ApiRequestOptions) => post<ExpenseRecord>(`/expenses/${id(expenseId)}/cancel`, { reason }, key, o),
    correctExpense: (expenseId: string, body: ExpenseCorrection, key: string, o?: ApiRequestOptions) => {
      amount(body.replacement.amount);
      date(body.replacement.expenseDate);
      return post<ExpenseRecord>(`/expenses/${id(expenseId)}/correct`, body, key, o);
    },
    getExpenseReport: (query: { from?: string; to?: string; period?: "DAY" | "MONTH" | "YEAR" } = {}, o?: ApiRequestOptions) => { range(query); return read<ExpenseReport>("/expenses/report", { ...query }, o); },
    listExpenseTemplates: (o?: ApiRequestOptions) => read<ExpenseTemplate[]>("/expense-templates", {}, o),
    createExpenseTemplate: (body: ExpenseTemplateCreate, key: string, o?: ApiRequestOptions) => { amount(body.amount); date(body.startsOn); return post<{ id: string }>("/expense-templates", body, key, o); },
    confirmExpenseTemplate: (templateId: string, expenseDate: string, key: string, o?: ApiRequestOptions) => { date(expenseDate); return post<ExpenseRecord>(`/expense-templates/${id(templateId)}/confirm`, { expenseDate }, key, o); },
    stopExpenseTemplate: (templateId: string, reason: string, key: string, o?: ApiRequestOptions) => post<{ id: string }>(`/expense-templates/${id(templateId)}/stop`, { reason }, key, o),
    getCashbookDay: (day?: string, o?: ApiRequestOptions) => { if (day) date(day); return read<CashbookDay>("/cashbook/daily", { date: day }, o); },
    getCashbookTransactions: (query: CashbookTransactionQuery = {}, o?: ApiRequestOptions) => read<ExpensePage<CashbookTransaction>>("/cashbook/transactions", { ...range(query) }, o),
    getCashbookClosings: (query: CashbookQuery = {}, o?: ApiRequestOptions) => read<ExpensePage<CashClosing>>("/cashbook/closings", { ...range(query) }, o),
    openCashbook: (body: { date: string; amount: ExpenseMoney; reason: string }, key: string, o?: ApiRequestOptions) => { date(body.date); amount(body.amount, true); return post<{ id: string }>("/cashbook/openings", body, key, o); },
    createCashMovement: (body: CashMovementCreate, key: string, o?: ApiRequestOptions) => { amount(body.amount); timestamp(body.occurredAt); return post<{ id: string }>("/cashbook/movements", body, key, o); },
    reverseCashMovement: (movementId: string, reason: string, key: string, o?: ApiRequestOptions) => post<{ id: string }>(`/cashbook/movements/${id(movementId)}/reverse`, { reason }, key, o),
    closeCashbook: (body: CashbookClose, key: string, o?: ApiRequestOptions) => {
      date(body.date);
      amount(body.actualCash, true);
      if (body.expectedCash !== undefined) expectedCash(body.expectedCash);
      return post<CashClosing>("/cashbook/closings", body, key, o);
    },
    reverseCashClosing: (closingId: string, reason: string, key: string, o?: ApiRequestOptions) => post<{ id: string }>(`/cashbook/closings/${id(closingId)}/reverse`, { reason }, key, o)
  };
}
