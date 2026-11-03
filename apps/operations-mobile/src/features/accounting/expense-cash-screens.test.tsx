import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CashbookDay } from "@restaurant-platform/api-client";
import { AccountingAuditScreen } from "./AccountingAuditScreen";
import { CashbookScreen, DailyCashClosingScreen } from "./CashbookScreens";
import { ExpenseScreen } from "./ExpenseCashScreens";
import { closingVariance, validFinancialDateRange } from "./expense-cash-form";
import { FinancialRequestKeys } from "./financial-requests";

const scenario = vi.hoisted(() => ({ state: "ready", records: {} as Record<string, unknown> }));
vi.mock("react-native", () => ({
  View: "div", Text: "span", Switch: "input", StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("../../api", () => ({ getOperationsApi: vi.fn() }));
vi.mock("../../hooks/useApiMutation", () => ({
  useApiMutation: () => ({ busy: false, error: null, message: null, run: vi.fn(), reset: vi.fn() })
}));
vi.mock("../../hooks/useApiQuery", () => ({
  useApiQuery: (_load: unknown, key: string) => ({
    state: scenario.state === "ready" ? { status: "ready", data: scenario.records[Object.keys(scenario.records).find(prefix => key.includes(prefix)) ?? ""] } :
      { status: scenario.state },
    reload: vi.fn()
  })
}));
vi.mock("../../components/ui", () => ({
  Page: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  Card: ({ title, children }: { title?: string; children: React.ReactNode }) => <section>{title ? <h2>{title}</h2> : null}{children}</section>,
  Body: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Action: ({ title, disabled }: { title: string; disabled?: boolean }) => <button disabled={disabled}>{title}</button>,
  FormField: ({ label }: { label: string }) => <label>{label}<input /></label>,
  ConfirmDialog: () => null,
  DataTable: () => null,
  StateView: ({ kind, onRetry }: { kind: string; onRetry?: () => void }) => <aside>{kind}{onRetry ? <button>Try again</button> : null}</aside>
}));
vi.mock("../../components/forms", () => ({
  FormToggle: ({ label }: { label: string }) => <label>{label}</label>,
  MutationFeedback: () => null
}));

const page = { items: [], total: 0, page: 0, size: 20 };
const day: CashbookDay = {
  date: "2026-11-02", timezone: "Asia/Yangon", openingBalance: "9007199254740993",
  cashSalesReceived: "50", cashRefundsPaid: "20", cashPurchasePayments: "0", cashExpensePayments: "0",
  otherReceipts: "0", otherPayments: "0", expectedClosingCash: "9007199254741023", closing: null,
  missingInputs: ["Historical cash refund requires reconciliation."]
};
const keyStore = () => new FinancialRequestKeys();

describe("expense and cash views", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    scenario.state = "ready";
    scenario.records = {};
  });

  it("displays search, server filters, chronological sort and the expense register empty state", () => {
    scenario.records.expenses = page;
    scenario.records["expense-report"] = { from: "2026-11-02", to: "2026-11-02", totals: [
      { periodStart: "2026-11-02", category: "RENT", postedAmount: "9007199254740992", cancelledAmount: "0", expenseAmount: "9007199254740992" },
      { periodStart: "2026-11-02", category: "WATER", postedAmount: "2", cancelledAmount: "1", expenseAmount: "1" }
    ] };
    const html = renderToStaticMarkup(<ExpenseScreen requestKeys={keyStore()} />);
    expect(html).toContain("Day (YYYY-MM-DD)");
    expect(html).toContain("Date range");
    expect(html).toContain("Search descriptions or payees");
    expect(html).toContain("All categories");
    expect(html).toContain("All statuses");
    expect(html).toContain("Oldest first");
    expect(html).toContain("No matching expenses");
    expect(html).toContain("Total operating expenses 9,007,199,254,740,993");
  });

  it("shows dated cash history with an exact signed amount and traceable source", () => {
    scenario.records["cash-transactions"] = {
      ...page, total: 1, items: [{
        id: "transaction", source: "EXPENSE_PAYMENT", sourceId: "original-expense",
        occurredAt: "2026-11-02T10:00:00+06:30", signedAmount: "-9007199254740993", description: "Expense payment", recordedBy: null
      }]
    };
    const html = renderToStaticMarkup(<CashbookScreen requestKeys={keyStore()} />);
    expect(html).toContain("EXPENSE PAYMENT · -9,007,199,254,740,993");
    expect(html).toContain("2026-11-02T10:00:00+06:30");
    expect(html).toContain("Source record original-expense");
    expect(html).toContain("Historical cashier unavailable");
  });

  it("shows the cash closing day, exact expected cash and mandatory historical reconciliation", () => {
    scenario.records["cash-day"] = day;
    scenario.records["cash-closings"] = page;
    const html = renderToStaticMarkup(<DailyCashClosingScreen requestKeys={keyStore()} />);
    expect(html).toContain("2026-11-02 · Asia/Yangon");
    expect(html).toContain("Expected closing cash 9,007,199,254,741,023");
    expect(html).toContain("Historical cash refund requires reconciliation.");
    expect(html).toContain('<button disabled="">Review closing count');
  });

  it("allows a variance explanation on a day with complete historical inputs", () => {
    scenario.records["cash-day"] = { ...day, missingInputs: [] };
    scenario.records["cash-closings"] = page;
    const html = renderToStaticMarkup(<DailyCashClosingScreen requestKeys={keyStore()} />);
    expect(html).toContain("Cash variance explanation (optional)");
    expect(html).not.toContain("I have reconciled the historical cash inputs");
  });

  it.each(["loading", "offline", "error", "denied"])("shows %s handling for live accounting queries", status => {
    scenario.state = status;
    for (const html of [renderToStaticMarkup(<ExpenseScreen requestKeys={keyStore()} />),
      renderToStaticMarkup(<DailyCashClosingScreen requestKeys={keyStore()} />),
      renderToStaticMarkup(<AccountingAuditScreen />)]) {
      expect(html).toContain(status);
      if (status !== "loading") expect(html).toContain("Try again");
    }
  });

  it("shows both sides of an audited expense correction and hides unrelated detail payloads", () => {
    const original = "11111111-1111-4111-8111-111111111111";
    const replacement = "22222222-2222-4222-8222-222222222222";
    const common = { entityType: "EXPENSE", actorId: "member", reason: "Correct payee", createdAt: "2026-11-02T10:30:00Z" };
    scenario.records["accounting-audit"] = { totalElements: 2, size: 20, content: [
      { ...common, id: "audit-1", entityId: original, action: "CORRECT", detailJson: JSON.stringify({ replacementExpenseId: replacement, unrelated: "raw JSON details" }) },
      { ...common, id: "audit-2", entityId: replacement, action: "REPLACE", detailJson: JSON.stringify({ originalExpenseId: original }) }
    ] };
    const html = renderToStaticMarkup(<AccountingAuditScreen />);
    expect(html).toContain(`Original expense ${original}`);
    expect(html).toContain(`Replacement expense ${replacement}`);
    expect(html).toContain("Correct payee");
    expect(html).not.toContain("raw JSON details");
  });
});

describe("cash closing inputs", () => {
  it("computes signed variance without narrowing financial integers", () => {
    expect(closingVariance("9007199254741023", "9007199254740993")).toBe("-30");
    expect(closingVariance("-8", "0")).toBe("8");
    expect(closingVariance("-9223372036854775808", "1")).toBeNull();
    expect(closingVariance("80", "10.5")).toBeNull();
  });

  it("allows a full leap year and rejects a longer or reversed window", () => {
    expect(validFinancialDateRange("2024-01-01", "2024-12-31")).toBe(true);
    expect(validFinancialDateRange("2024-01-01", "2025-01-01")).toBe(false);
    expect(validFinancialDateRange("2024-12-31", "2024-01-01")).toBe(false);
  });
});
