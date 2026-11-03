import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scenario = vi.hoisted(() => ({
  role: "MANAGER", status: "ready", restaurantId: "11111111-1111-4111-8111-111111111111",
  reload: vi.fn(),
  daily: { reportDate: "2026-11-03", timezone: "Asia/Bangkok", totalOrders: 2, completedOrders: 1, cancelledOrders: 0, orderAmountExcludingCancelled: 2500, paidAmount: 1000 } as object | null
}));
vi.mock("react-native", () => ({ Image: "img", Text: "span", View: "div", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("expo-router", () => ({ Link: ({ children }: React.PropsWithChildren) => <a>{children}</a> }));
vi.mock("../../api", () => ({ getOperationsApi: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: {
  status: "ready", membership: { role: scenario.role, active: true, restaurantId: scenario.restaurantId, name: "Test restaurant" }
} }) }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ restaurantId: scenario.restaurantId }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => ({
  state: { status: scenario.status, data: key.startsWith("dashboard:")
    ? { restaurant: null, orders: null, queue: [], deliveries: { totalElements: 0, content: [] }, notifications: [], daily: scenario.daily }
    : { content: [], number: 0, totalPages: 0, totalElements: 0, first: true, last: true } },
  reload: scenario.reload
}) }));
vi.mock("../../hooks/useApiMutation", () => ({ useApiMutation: () => ({ busy: false, error: null, message: null }) }));
vi.mock("../../components/ui", () => ({
  Page: ({ title, children }: React.PropsWithChildren<{ title: string }>) => <main><h1>{title}</h1>{children}</main>,
  Card: ({ title, children }: React.PropsWithChildren<{ title?: string }>) => <section><h2>{title}</h2>{children}</section>,
  Body: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  Action: ({ title, disabled }: { title: string; disabled?: boolean }) => <button disabled={disabled}>{title}</button>,
  ConfirmDialog: () => null,
  FormField: ({ label }: { label: string }) => <label>{label}<input /></label>,
  StateView: ({ kind, onRetry }: { kind: string; onRetry?: () => void }) => <aside>{kind}{onRetry ? <button>Try again</button> : null}</aside>
}));

import { DashboardScreen } from "./DashboardScreen";
import { OrdersScreen } from "./OrdersScreen";

const daily = scenario.daily;

beforeEach(() => {
  vi.stubGlobal("React", React);
  scenario.role = "MANAGER";
  scenario.status = "ready";
  scenario.daily = daily;
});

describe("Manager operational screens", () => {
  it("separates daily operations from shared accounting and labels the restaurant's local day", () => {
    const html = renderToStaticMarkup(<DashboardScreen />);
    expect(html).toContain("2026-11-03 · Asia/Bangkok");
    expect(html).toContain("Value of orders created today, excluding cancellations: 2,500");
    expect(html).toContain("Payments marked paid today: 1,000");
    expect(html).toContain("Open shared financial reports");
    expect(html).not.toContain("Open team");
  });

  it("renders an unavailable daily totals state without inventing amounts", () => {
    scenario.daily = null;
    const html = renderToStaticMarkup(<DashboardScreen />);
    expect(html).toContain("operational totals are unavailable");
    expect(html).not.toContain("Payments marked paid today:");
    expect(html).toContain("Refresh overview");
  });

  it.each(["OWNER", "MANAGER", "STAFF"])("lets %s start a counter order from the normal Orders screen", role => {
    scenario.role = role;
    const html = renderToStaticMarkup(<OrdersScreen />);
    expect(html).toContain("Create counter order");
    expect(html).toContain("No matching orders on this page.");
    expect(html).toContain("Refresh orders");
  });

  it("withholds the counter order form from an unpermitted role or history screen", () => {
    scenario.role = "DELIVERY_DRIVER";
    expect(renderToStaticMarkup(<OrdersScreen />)).not.toContain("Create counter order");
    scenario.role = "MANAGER";
    expect(renderToStaticMarkup(<OrdersScreen history />)).not.toContain("Create counter order");
  });

  it.each(["loading", "offline", "error", "denied"])("shows the %s state for the Orders query", status => {
    scenario.status = status;
    const html = renderToStaticMarkup(<OrdersScreen />);
    expect(html).toContain(`<aside>${status}`);
    if (status !== "loading") expect(html).toContain("Try again");
  });
});
