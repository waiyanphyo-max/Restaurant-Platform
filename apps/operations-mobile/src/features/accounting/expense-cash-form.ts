import { useEffect, useState } from "react";
import { ApiHttpError } from "@restaurant-platform/api-client";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormValidationError } from "../../hooks/mutation";
import { isIsoDate } from "../operations/format";
import type { FinancialRequestKeys } from "./financial-requests";

const maxAmount = 9223372036854775807n;

export const chronologicalLabels = { NEWEST: "Newest first", OLDEST: "Oldest first" } as const;

export function financialAmount(value: string) {
  return /^-?\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "Amount unavailable";
}

export function signedFinancialAmount(value: string) {
  return /^\d+$/.test(value) && BigInt(value) > 0n ? `+${financialAmount(value)}` : financialAmount(value);
}

export function validFinancialAmount(value: string, allowZero = false) {
  return /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) <= maxAmount && (allowZero || value !== "0");
}

export function closingVariance(expectedCash: string, actualCash: string) {
  if (!/^-?\d+$/.test(expectedCash) || !validFinancialAmount(actualCash, true)) return null;
  const variance = BigInt(actualCash) - BigInt(expectedCash);
  return variance < -maxAmount - 1n || variance > maxAmount ? null : variance.toString();
}

export function validFinancialDate(value: string) {
  return isIsoDate(value) && value >= "1900-01-01" && value <= "9998-12-31";
}

export function validFinancialDateRange(from: string, to: string) {
  if (from && !validFinancialDate(from) || to && !validFinancialDate(to)) return false;
  return !from || !to || to >= from && Date.parse(to) - Date.parse(from) <= 365 * 86_400_000;
}

export function validFinancialTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
    validFinancialDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

export function useFinancialAction(requestKeys: FinancialRequestKeys, operations?: readonly string[], onDenied?: () => void) {
  const mutation = useApiMutation();
  const [denied, setDenied] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [historyChecked, setHistoryChecked] = useState(false);
  const [, refreshPending] = useState(0);
  const uncertainOperations = requestKeys.uncertainOperations().filter(operation => !operations || operations.includes(operation));
  const pending = uncertainOperations.some(operation => requestKeys.isPending(operation));
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => refreshPending(value => value + 1), 500);
    return () => clearInterval(timer);
  }, [pending]);
  async function post<T>(operation: string, body: unknown, action: (key: string) => Promise<T>, success?: (value: T) => void, failure?: (error: unknown) => void) {
    if (denied) return;
    setReconciled(false);
    await mutation.run(async () => {
      if (requestKeys.isUncertain(operation)) {
        throw new FormValidationError("Check the authoritative financial history before reviewing another action. ငွေစာရင်းမှတ်တမ်းကို အရင်ပြန်စစ်ပါ။");
      }
      // Hold before dispatch so tab unmounts cannot enable another money event.
      if (!requestKeys.begin(operation, body)) throw new FormValidationError("This financial action is already awaiting confirmation. ငွေစာရင်းတင်ခြင်းကို စောင့်ဆိုင်းနေပါသည်။");
      try {
        const result = await action(requestKeys.key(operation, body));
        requestKeys.settle(operation);
        requestKeys.reconcile(operation);
        return result;
      } catch (error) {
        requestKeys.settle(operation);
        if (error instanceof ApiHttpError && error.status < 500 && error.status !== 409) requestKeys.reconcile(operation);
        throw error;
      }
    }, success, error => {
      if (error instanceof ApiHttpError && error.status === 403) { setDenied(true); onDenied?.(); }
      if (!(error instanceof FormValidationError) && (!(error instanceof ApiHttpError) || error.status >= 500 || error.status === 409)) {
        requestKeys.markUncertain(operation, body);
        setHistoryChecked(false);
      }
      failure?.(error);
    });
  }
  async function reconcile<T>(read: () => Promise<T>, onRead?: (value: T) => void) {
    if (denied || uncertainOperations.some(operation => requestKeys.isPending(operation))) return;
    setHistoryChecked(false);
    await mutation.run(read, value => {
      onRead?.(value);
      setHistoryChecked(true);
    }, error => {
      if (error instanceof ApiHttpError && error.status === 403) { setDenied(true); onDenied?.(); }
    });
  }
  function acknowledgeHistory() {
    if (!historyChecked || uncertainOperations.some(operation => requestKeys.isPending(operation))) return;
    uncertainOperations.forEach(operation => requestKeys.reconcile(operation));
    setHistoryChecked(false);
    setReconciled(true);
  }
  return { ...mutation, message: reconciled || historyChecked ? "Current history loaded. Review the records before confirming another action. မှတ်တမ်းကို ပြန်စစ်ပြီးမှ အတည်ပြုပါ။" : mutation.message,
    post, denied, uncertain: uncertainOperations.length > 0, pending, historyChecked, reconcile, acknowledgeHistory };
}
