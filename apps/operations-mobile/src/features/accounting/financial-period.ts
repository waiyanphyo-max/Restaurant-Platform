export type FinancialPeriodMode = "DAY" | "MONTH" | "YEAR" | "RANGE";
export interface FinancialPeriodInput {
  mode: FinancialPeriodMode;
  day: string;
  month: string;
  year: string;
  from: string;
  to: string;
}

export const emptyFinancialPeriod: FinancialPeriodInput = { mode: "DAY", day: "", month: "", year: "", from: "", to: "" };

export function isFinancialYear(value: string) {
  return /^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 9998;
}

export function isFinancialMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && isFinancialYear(value.slice(0, 4));
}

export function isFinancialDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isFinancialMonth(value.slice(0, 7))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Dates stay calendar strings. The server applies the restaurant timezone. */
export function resolveFinancialPeriod(input: FinancialPeriodInput): { from?: string; to?: string } {
  if (input.mode === "DAY") {
    const day = input.day.trim();
    if (!day) return {};
    if (!isFinancialDate(day)) throw new Error("Enter a valid date as YYYY-MM-DD.");
    return { from: day, to: day };
  }
  if (input.mode === "MONTH") {
    const month = input.month.trim();
    if (!isFinancialMonth(month)) throw new Error("Enter a valid month as YYYY-MM.");
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${last}` };
  }
  if (input.mode === "YEAR") {
    const year = input.year.trim();
    if (!isFinancialYear(year)) throw new Error("Enter a year from 1900 through 9998.");
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const from = input.from.trim(), to = input.to.trim();
  if (!isFinancialDate(from) || !isFinancialDate(to) || from > to) throw new Error("Enter two valid dates in chronological order.");
  const elapsedDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (elapsedDays > 365) throw new Error("Select a range of up to 366 calendar days.");
  return { from, to };
}
