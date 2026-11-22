import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancialReport } from "@restaurant-platform/shared-types";
import { FinancialOverviewScreen, FinancialSummaryScreen } from "../operations/ReportsScreen";
import { FinanceMetric } from "./FinanceMetric";

const scenario = vi.hoisted(() => ({ status: "ready", report: null as FinancialReport | null }));
vi.mock("react-native", () => ({ View: "div", StyleSheet: { create: (s: unknown) => s } }));
vi.mock("../../api", () => ({ getOperationsApi: vi.fn() }));
vi.mock("../../auth/native", () => ({ getOperationsAuth: vi.fn() }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: vi.fn() }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: () => ({ state: { status: scenario.status, data: scenario.report }, reload: vi.fn() }) }));
vi.mock("./SalesDashboardPanel", () => ({ SalesDashboardPanel: () => null, SalesTotals: ({ value }: { value: FinancialReport["sales"] }) =>
  <p>Order-cohort net sales {value.netSales}; collected {value.collectedPayments}; outstanding {value.outstandingPayments}</p> }));
vi.mock("./ExportReportsScreen", () => ({ ExportReportsScreen: () => null }));
vi.mock("../../components/ui", () => ({
  useUiTheme: () => ({ color: { border: "#ddd" } }),
  Body: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  Status: ({ children }: React.PropsWithChildren) => <aside>{children}</aside>,
  Card: ({ title, children }: React.PropsWithChildren<{ title?: string }>) => <section><h2>{title}</h2>{children}</section>,
  Action: ({ title }: { title: string }) => <button>{title}</button>,
  FormField: ({ label }: { label: string }) => <label>{label}</label>,
  StateView: ({ kind, onRetry }: { kind: string; onRetry?: () => void }) => <aside>{kind}{onRetry ? <button>Try again</button> : null}</aside>,
}));

function report(restaurantId: string, currency: string, timezone: string): FinancialReport {
  return { restaurantId, currency, timezone, from: "2024-02-29", to: "2024-02-29", reportType: "CASH_FLOW_AND_EXPENSE_SUMMARY",
    sales: { from: "2024-02-29", to: "2024-02-29", grossSales: "9007199254741003", discounts: "10", netSales: "9007199254740993",
      collectedPayments: "100", outstandingPayments: "9007199254740893", refundedAmounts: "0", orders: 2, cancelledOrders: 0, productsSold: 2, legacyRefundsWithoutEventTime: "0" },
    confirmedPurchases: "9007199254740993", registeredOperatingExpenses: "0", purchasePayments: "25", expensePayments: "0", tradingPaymentNet: "75",
    expensesByCategory: [], costOfGoodsSold: null, grossProfit: null, netOperatingProfit: null, missingInputs: ["Inventory valuation unavailable"] };
}

describe("finance overview source presentation", () => {
  beforeEach(() => { vi.stubGlobal("React", React); scenario.status = "ready"; scenario.report = report("11111111-1111-4111-8111-111111111111", "MMK", "Asia/Yangon"); });
  it.each([
    ["11111111-1111-4111-8111-111111111111", "MMK", "Asia/Yangon"],
    ["22222222-2222-4222-8222-222222222222", "THB", "Asia/Bangkok"],
  ])("uses the supplied restaurant %s policy and exact obligations", (id, currency, timezone) => {
    scenario.report = report(id, currency, timezone);
    const html = renderToStaticMarkup(<FinancialOverviewScreen />);
    expect(html).toContain(timezone);
    expect(html).toContain(`9,007,199,254,740,993 ${currency}`);
    expect(html).toContain("2024-02-29");
    expect(html).toContain("collected 100");
    expect(html).toContain("outstanding 9007199254740893");
    expect(html).toContain("not profit or a reconciled physical cash balance");
    expect(html).not.toContain("240,000");
  });
  it("distinguishes unavailable amounts from actual zero", () => {
    const html = renderToStaticMarkup(<><FinanceMetric label="Unknown" amount={null} currency="MMK" /><FinanceMetric label="Actual zero" amount="0" currency="MMK" /></>);
    expect(html).toContain("Unavailable"); expect(html).toContain("0 MMK");
    expect(renderToStaticMarkup(<FinanceMetric label="Invalid" amount="1.5" currency="MMK" />)).not.toContain("1.5 MMK");
  });
  it("keeps unsupported profit unavailable even when purchase and sales inputs exist", () => {
    const html = renderToStaticMarkup(<FinancialSummaryScreen />);
    expect(html).toContain("Profit figures unavailable"); expect(html).toContain("Inventory valuation unavailable");
    expect(html).toContain("partial trading payment view"); expect(html).toContain("75 MMK");
  });
  it.each(["loading", "offline", "error", "denied"])("does not render private figures in %s state", status => {
    scenario.status = status;
    const html = renderToStaticMarkup(<FinancialOverviewScreen />);
    expect(html).not.toContain("9,007,199");
    expect(html.includes("Try again")).toBe(["offline", "error"].includes(status));
  });
});
