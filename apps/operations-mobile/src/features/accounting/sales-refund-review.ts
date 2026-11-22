import type { SalesLedgerOrder, SalesRefundRequest } from "@restaurant-platform/shared-types";
import { isFinancialDate } from "./financial-period";

/** The current snapshot is a review aid. The server rechecks the cap under its tenant lock. */
export function remainingRefundAmount(sale: SalesLedgerOrder, paymentId: string): string | null {
  const payment = sale.payments.find(value => value.id === paymentId && value.status === "PAID" && value.paidAt !== null);
  if (!payment || !/^\d+$/.test(payment.amount)) return null;
  const reversed = new Set(sale.refundReversals.map(value => value.refundId));
  const used = sale.refunds.filter(value => value.paymentId === paymentId && !reversed.has(value.id))
    .reduce((total, value) => total + BigInt(value.amount), 0n);
  const remaining = BigInt(payment.amount) - used;
  return remaining < 0n ? null : remaining.toString();
}

export function validRefundReview(sale: SalesLedgerOrder, body: SalesRefundRequest, now = Date.now()): boolean {
  const remaining = remainingRefundAmount(sale, body.paymentId);
  const payment = sale.payments.find(value => value.id === body.paymentId);
  const timestamp = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d{1,9})?(Z|[+-](?:0\d|1[0-8]):[0-5]\d)$/.exec(body.refundedAt);
  if (!timestamp || !isFinancialDate(timestamp[1]) || /[+-]18:(?!00)/.test(body.refundedAt)) return false;
  const instant = Date.parse(body.refundedAt);
  return remaining !== null && /^[1-9]\d{0,18}$/.test(body.amount) && BigInt(body.amount) <= 9223372036854775807n
    && BigInt(body.amount) <= BigInt(remaining) && !!body.reason.trim()
    && Number.isFinite(instant) && instant <= now && instant >= Date.parse(payment?.paidAt ?? "");
}
