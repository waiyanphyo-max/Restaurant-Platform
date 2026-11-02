import { describe, expect, it } from "vitest";
import { FinancialRequestKeys } from "./financial-requests";

describe("financial form request identities", () => {
  it("reuses an unchanged payment key after intervening actions and repeated submissions", () => {
    let sequence = 0;
    const requests = new FinancialRequestKeys(() => `request-${++sequence}`);
    const payment = { amount: "100", method: "CASH", paidAt: "2026-11-02T10:00:00+07:00" };
    const original = requests.key("expense.pay:expense-a", payment);
    requests.key("expense.cancel:expense-b", { reason: "Duplicate expense" });
    expect(requests.key("expense.pay:expense-a", { ...payment })).toBe(original);
    expect(requests.key("expense.pay:expense-a", { ...payment })).toBe(original);
    expect(requests.key("expense.pay:expense-a", { ...payment, paidAt: "2026-11-02T10:30:00+07:00" })).not.toBe(original);
  });
  it("distinguishes restaurant financial records and exact large monetary strings", () => {
    let sequence = 0;
    const requests = new FinancialRequestKeys(() => `request-${++sequence}`);
    const first = requests.key("expense.pay:expense-a", { amount: "9007199254740992" });
    expect(requests.key("expense.pay:expense-a", { amount: "9007199254740993" })).not.toBe(first);
    expect(requests.key("expense.pay:expense-b", { amount: "9007199254740992" })).not.toBe(first);
  });
});
