import type { Uuid, IsoDateTime } from "./api.js";

/** Integer whole-currency strings and decimal quantity strings are never converted to floating point. */
export type ProcurementMoney = string;
export type ProcurementQuantity = string;
export interface ProcurementPage<T> { content: T[]; totalElements: number; page: number; size: number; }
export interface AccountingSupplierInput { name: string; contact?: string | null; active: boolean; reason?: string | null; }
export interface AccountingSupplier { id: Uuid; name: string; contact: string | null; active: boolean; createdBy: Uuid; createdAt: IsoDateTime; updatedBy: Uuid; updatedAt: IsoDateTime; }
export interface ShoppingItemInput { name: string; defaultUnit: string; defaultQuantity?: ProcurementQuantity | null; supplierId?: Uuid | null; suggestionEnabled: boolean; reason?: string | null; }
export interface ShoppingItem { id: Uuid; name: string; defaultUnit: string; defaultQuantity: ProcurementQuantity | null; supplierId: Uuid | null; suggestionEnabled: boolean; latestUnitCost: ProcurementMoney | null; latestCostUnit: string | null; lastConfirmedPurchaseDate: string | null; suggested: boolean; createdBy: Uuid; createdAt: IsoDateTime; updatedBy: Uuid; updatedAt: IsoDateTime; }
export interface ShoppingLineInput { itemId: Uuid; quantity: ProcurementQuantity; unit: string; unitCost: ProcurementMoney; supplierId?: Uuid | null; }
export interface ShoppingLine { id: Uuid; itemId: Uuid; itemName: string; quantity: ProcurementQuantity; unit: string; unitCost: ProcurementMoney; lineTotal: ProcurementMoney; supplierId: Uuid | null; }
export interface ShoppingSheetInput { shoppingDate: string; lines: ShoppingLineInput[]; reason?: string | null; }
export interface ShoppingSheet { id: Uuid; shoppingDate: string; status: "PLANNED" | "PURCHASED" | "CANCELLED"; paymentStatus: string; purchaseId: Uuid | null; lines: ShoppingLine[]; createdBy: Uuid; createdAt: IsoDateTime; updatedBy: Uuid; updatedAt: IsoDateTime; }
export interface ConfirmPurchaseInput { purchaseDate: string; purchasedAt: IsoDateTime; supplierId?: Uuid | null; lines: ShoppingLineInput[]; sheetId?: Uuid | null; dueDate?: string | null; receiptId?: Uuid | null; invoiceReference?: string | null; correctionOfId?: Uuid | null; correctionReason?: string | null; }
export type PurchasePaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export interface PurchaseSummary { id: Uuid; purchaseDate: string; purchasedAt: IsoDateTime; supplierId: Uuid | null; supplierName: string | null; totalAmount: ProcurementMoney; amountPaid: ProcurementMoney; outstandingAmount: ProcurementMoney; paymentStatus: PurchasePaymentStatus; status: "CONFIRMED" | "CANCELLED"; dueDate: string | null; invoiceReference: string | null; receiptId: Uuid | null; correctionOfId: Uuid | null; createdBy: Uuid; createdAt: IsoDateTime; }
export type ProcurementPaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
export interface PurchasePaymentInput { amount: ProcurementMoney; method: ProcurementPaymentMethod; paidAt: IsoDateTime; }
export interface PurchasePayment { id: Uuid; amount: ProcurementMoney; method: ProcurementPaymentMethod; paidAt: IsoDateTime; createdBy: Uuid; createdAt: IsoDateTime; reversalId: Uuid | null; reversalReason: string | null; reversedBy: Uuid | null; reversedAt: IsoDateTime | null; }
export interface PurchaseAdjustment { id: Uuid; reason: string; createdBy: Uuid; createdAt: IsoDateTime; }
export interface PurchaseDetail { purchase: PurchaseSummary; lines: ShoppingLine[]; payments: PurchasePayment[]; cancellations: PurchaseAdjustment[]; corrections: Uuid[]; }
export interface PurchaseMonthlyTotal { month: string; confirmedTotal: ProcurementMoney; purchaseCount: number; }
export interface PurchaseReport { from: string; to: string; confirmedTotal: ProcurementMoney; cancelledTotal: ProcurementMoney; purchaseCount: number; monthlyTotals: PurchaseMonthlyTotal[]; }
export interface SupplierPayable { supplierId: Uuid; supplierName: string; confirmedObligations: ProcurementMoney; amountPaid: ProcurementMoney; outstandingAmount: ProcurementMoney; earliestUnpaidDueDate: string | null; }
export interface SupplierPurchasePayment { purchaseId: Uuid; invoiceReference: string | null; payment: PurchasePayment; }
export interface ProcurementPageQuery { page?: number; size?: number; }
export interface PurchaseQuery extends ProcurementPageQuery { from?: string; to?: string; supplierId?: Uuid; item?: string; paymentStatus?: PurchasePaymentStatus; }
export interface ShoppingItemQuery extends ProcurementPageQuery { search?: string; suggestionsOnly?: boolean; }
export interface ShoppingSheetQuery extends ProcurementPageQuery { from?: string; to?: string; }
