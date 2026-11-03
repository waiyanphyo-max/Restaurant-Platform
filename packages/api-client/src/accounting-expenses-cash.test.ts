import { describe, expect, it, vi } from "vitest";
import { createExpenseCashApiClient } from "./accounting-expenses-cash.js";
import { createFinancialReportsApiClient } from "./accounting-reports.js";

const restaurantId = "7ed59945-9e23-4cae-968f-b16b4b7c069b";
function client(fetchImpl: typeof fetch) { return createExpenseCashApiClient({ baseUrl: "https://api.example.com", restaurantId, getAccessToken: () => "verified-token", fetchImpl }); }
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

describe("expense and cash accounting client", () => {
  it("preserves amounts beyond JavaScript's integer precision and scopes authenticated writes", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ id: "expense-id", amount: "9007199254740993" }));
    await client(fetchImpl).createExpense({ category: "RENT", amount: "9007199254740993", expenseDate: "2026-11-02", description: "Rent" }, "rent-request-1");
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.com/api/v1/restaurants/${restaurantId}/accounting/expenses`);
    expect(JSON.parse(String(options?.body)).amount).toBe("9007199254740993");
    const headers = new Headers(options?.headers);
    expect(headers.get("Authorization")).toBe("Bearer verified-token");
    expect(headers.get("Idempotency-Key")).toBe("rent-request-1");
    expect(options?.credentials).toBe("omit");
  });
  it("rejects fractional, out-of-range and invalid historical amounts before network access", () => {
    const fetchImpl = vi.fn<typeof fetch>();const api = client(fetchImpl);
    for (const amount of ["1.5", "-1", "9223372036854775808", "001", "0"]) {
      expect(() => api.createExpense({ category: "RENT", amount, expenseDate: "2026-11-02", description: "Rent" }, "invalid-amount")).toThrow();
    }
    expect(() => api.openCashbook({ date: "2026-02-30", amount: "0", reason: "Opening" }, "opening")).toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("retains the exact key and payload when retrying a transient payment failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(response({ expense: {}, payments: [] }));
    await client(fetchImpl).payExpense("f83b96e5-240b-4d0d-86f4-17f254138f72", { amount: "100", method: "CASH", paidAt: "2026-11-02T09:00:00+07:00" }, "same-payment-key");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = fetchImpl.mock.calls[0][1], second = fetchImpl.mock.calls[1][1];
    expect(new Headers(first?.headers).get("Idempotency-Key")).toBe(new Headers(second?.headers).get("Idempotency-Key"));
    expect(first?.body).toBe(second?.body);
  });
  it("posts explicit reconciliation acknowledgments without altering monetary strings", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ id: "closing" }));
    const count = { date: "2026-11-02", actualCash: "0", expectedCash: "-9007199254740993", acknowledgeMissingInputs: true, reconciliationReason: "Verified original receipts and counted driver cash" };
    await client(fetchImpl).closeCashbook(count, "count-1");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual(count);
  });
  it("posts a reasoned, tenant-scoped correction without changing the original payload's precision", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ id: "replacement" }));
    const originalId = "f83b96e5-240b-4d0d-86f4-17f254138f72";
    const correction = { replacement: { category: "WATER" as const, amount: "9007199254740993", expenseDate: "2026-11-02", description: "Water" }, reason: "Correct category" };
    await client(fetchImpl).correctExpense(originalId, correction, "correct-1");
    const [url, options] = fetchImpl.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe(`/api/v1/restaurants/${restaurantId}/accounting/expenses/${originalId}/correct`);
    expect(JSON.parse(String(options?.body))).toEqual(correction);
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe("correct-1");
  });
  it("sends history filters and sort to the backend before pagination", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response({}));
    const api = client(fetchImpl);
    const reports = createFinancialReportsApiClient({ baseUrl: "https://api.example.com", restaurantId, getAccessToken: () => "verified-token", fetchImpl });
    await api.listExpenses({ search: "payee", category: "WATER", sort: "OLDEST", page: 2 });
    await api.getCashbookTransactions({ search: "Owner deposit", sort: "NEWEST", page: 3 });
    await reports.getAccountingAudit(undefined, 4, 20, undefined, { search: "correction", sort: "OLDEST" });
    expect(fetchImpl.mock.calls.map(([url]) => Object.fromEntries(new URL(String(url)).searchParams))).toEqual([
      { search: "payee", category: "WATER", sort: "OLDEST", page: "2" },
      { search: "Owner deposit", sort: "NEWEST", page: "3" },
      { search: "correction", sort: "OLDEST", page: "4", size: "20" }
    ]);
  });
});
