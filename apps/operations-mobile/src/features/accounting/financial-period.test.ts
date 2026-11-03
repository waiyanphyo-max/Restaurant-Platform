import { describe, expect, it } from "vitest";
import { emptyFinancialPeriod, resolveFinancialPeriod } from "./financial-period";

describe("accounting report calendar filters", () => {
  it("uses the backend's restaurant-local day when the day field is blank", () => {
    expect(resolveFinancialPeriod(emptyFinancialPeriod)).toEqual({});
  });

  it("preserves a selected day and the full month and year for a leap year", () => {
    expect(resolveFinancialPeriod({ ...emptyFinancialPeriod, day: "2024-02-29" })).toEqual({ from: "2024-02-29", to: "2024-02-29" });
    expect(resolveFinancialPeriod({ ...emptyFinancialPeriod, mode: "MONTH", month: "2024-02" })).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(resolveFinancialPeriod({ ...emptyFinancialPeriod, mode: "YEAR", year: "2024" })).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });

  it("allows 366 inclusive days and rejects reversed, too long, and unsupported periods", () => {
    const yearRange = { ...emptyFinancialPeriod, mode: "RANGE" as const, from: "2024-01-01", to: "2024-12-31" };
    expect(resolveFinancialPeriod(yearRange)).toEqual({ from: yearRange.from, to: yearRange.to });
    expect(() => resolveFinancialPeriod({ ...yearRange, to: "2025-01-01" })).toThrow("366 calendar days");
    expect(() => resolveFinancialPeriod({ ...yearRange, to: "2023-12-31" })).toThrow("chronological");
    expect(() => resolveFinancialPeriod({ ...emptyFinancialPeriod, day: "2025-02-29" })).toThrow("valid date");
    expect(() => resolveFinancialPeriod({ ...emptyFinancialPeriod, mode: "YEAR", year: "9999" })).toThrow("9998");
  });
});
