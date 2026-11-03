import { useApiMutation } from "../../hooks/useApiMutation";
import { isIsoDate } from "../operations/format";
import type { FinancialRequestKeys } from "./financial-requests";

const maxAmount = 9223372036854775807n;

export const chronologicalLabels = { NEWEST: "Newest first", OLDEST: "Oldest first" } as const;

export function financialAmount(value: string) {
  return /^-?\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "Amount unavailable";
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

export function useFinancialAction(requestKeys: FinancialRequestKeys) {
  const mutation = useApiMutation();
  async function post<T>(operation: string, body: unknown, action: (key: string) => Promise<T>, success?: (value: T) => void) {
    await mutation.run(() => action(requestKeys.key(operation, body)), success);
  }
  return { ...mutation, post };
}
