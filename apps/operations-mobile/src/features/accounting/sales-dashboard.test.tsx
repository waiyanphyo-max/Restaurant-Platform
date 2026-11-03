import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesDashboard, SalesSummary } from "@restaurant-platform/shared-types";
import { SalesDashboardPanel } from "./SalesDashboardPanel";

const scenario = vi.hoisted(() => ({
  exportCsv: vi.fn(),
  chart: vi.fn(),
  captureExport: vi.fn(),
  state: "ready",
  data: null as SalesDashboard | null
}));
vi.mock("react-native", () => ({ View: "div", Text: "span", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../../auth/native", () => ({ getOperationsAuth: () => ({ getAccessToken: () => "verified" }) }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({}) }));
vi.mock("@restaurant-platform/api-client", () => ({ createSalesAccountingApiClient: () => ({ exportCsv: scenario.exportCsv }) }));
vi.mock("../../hooks/useApiQuery", () => ({
  useApiQuery: () => ({ state: { status: scenario.state, data: scenario.data }, reload: vi.fn() })
}));
vi.mock("./AccountingCsvAction", () => ({
  AccountingCsvAction: ({ fetchCsv }: { fetchCsv(signal: AbortSignal): Promise<string> }) => {
    scenario.captureExport(fetchCsv);
    return <button>Export CSV</button>;
  }
}));
vi.mock("../../components/ui", () => ({
  Card: ({ title, children }: { title?: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  Body: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Action: ({ title, disabled }: { title: string; disabled?: boolean }) => <button disabled={disabled}>{title}</button>,
  FormField: ({ label }: { label: string }) => <label>{label}<input /></label>,
  BarChart: ({ label, points }: { label: string; points: unknown }) => {
    scenario.chart(label, points);
    return <aside>{label}</aside>;
  },
  DataTable: () => null,
  StateView: ({ kind, onRetry }: { kind: string; onRetry?: () => void }) => <aside>{kind}{onRetry ? <button>Try again</button> : null}</aside>
}));

const day: SalesSummary = {
  from: "2024-02-29", to: "2024-02-29", grossSales: "9007199254741003", discounts: "10", netSales: "9007199254740993",
  collectedPayments: "100", outstandingPayments: "0", refundedAmounts: "0", orders: 2, cancelledOrders: 1,
  productsSold: 3, legacyRefundsWithoutEventTime: "0"
};

describe("shared sales dashboard", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    scenario.state = "ready";
    scenario.data = {
      currency: "THB", timezone: "Asia/Bangkok", today: day, selectedDay: day,
      selectedMonth: { ...day, from: "2024-02-01" }, selectedYear: { ...day, from: "2024-01-01", to: "2024-12-31" },
      dailyTrend: [], monthlyTrend: [
        { period: "2024-01", grossSales: "1", discounts: "0", netSales: "1", orders: 1, productsSold: 1 },
        { period: "2024-02", grossSales: day.grossSales, discounts: day.discounts, netSales: day.netSales, orders: 2, productsSold: 3 }
      ], topProducts: [], definitions: {}, missingInputs: []
    };
  });

  it("graphs sales and order counts while preserving exact server amounts and exporting the displayed dates", async () => {
    const html = renderToStaticMarkup(<SalesDashboardPanel />);
    expect(html).toContain("Net sales before refunds: 9,007,199,254,740,993");
    expect(html).toContain("Collected payments: 100");
    expect(html).toContain("Refresh sales reports");
    expect(scenario.chart).toHaveBeenCalledWith("Monthly net sales before refunds (THB)", [
      { label: "2024-01", value: 0, displayValue: "1" },
      { label: "2024-02", value: 10000, displayValue: "9,007,199,254,740,993" }
    ]);
    expect(scenario.chart).toHaveBeenCalledWith("Monthly order counts", [{ label: "2024-01", value: 1 }, { label: "2024-02", value: 2 }]);
    const signal = new AbortController().signal;
    await scenario.captureExport.mock.calls[0][0](signal);
    expect(scenario.exportCsv).toHaveBeenCalledWith({ from: "2024-02-29", to: "2024-02-29" }, { signal });
  });

  it.each(["loading", "offline", "error", "denied"])("shows the %s state without chart or export data", status => {
    scenario.state = status;
    const html = renderToStaticMarkup(<SalesDashboardPanel />);
    expect(html).toContain(status);
    expect(html.includes("Try again")).toBe(status !== "loading");
    expect(scenario.chart).not.toHaveBeenCalled();
    expect(scenario.captureExport).not.toHaveBeenCalled();
  });
});
