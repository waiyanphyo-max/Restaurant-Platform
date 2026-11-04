import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scenario = vi.hoisted(() => ({
  role: "MANAGER", status: "ready", restaurantId: "11111111-1111-4111-8111-111111111111",
  reload: vi.fn(),
  orderType: "TAKEAWAY", orderStatus: "PREPARING", busy: false,
  daily: { reportDate: "2026-11-03", timezone: "Asia/Bangkok", totalOrders: 2, completedOrders: 1, cancelledOrders: 0, orderAmountExcludingCancelled: 2500, paidAmount: 1000 } as object | null
}));
vi.mock("react-native", () => ({ Image: "img", Text: "span", View: "div", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("expo-router", () => ({ Link: ({ children, href }: React.PropsWithChildren<{ href: string | { params: { orderId: string } } }>) =>
  <a href={typeof href === "string" ? href : `/order/${href.params.orderId}`}>{children}</a> }));
vi.mock("../../api", () => ({ getOperationsApi: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: {
  status: "ready", membership: { role: scenario.role, active: true, restaurantId: scenario.restaurantId, name: "Test restaurant" }
} }) }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ restaurantId: scenario.restaurantId }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => {
  let data: unknown = { content: [], number: 0, totalPages: 0, totalElements: 0, first: true, last: true };
  if (key.startsWith("dashboard:")) {
    data = { restaurant: null, orders: null, queue: [], deliveries: { totalElements: 0, content: [] }, notifications: [], daily: scenario.daily };
  } else if (key.startsWith("order:")) {
    data = {
      orderNumber: "T-17", orderType: scenario.orderType, orderChannel: "COMMON_QR", status: scenario.orderStatus,
      createdAt: "2026-11-03T09:00:00Z", subtotal: 2500, discountAmount: 0, deliveryFee: 0, totalAmount: 2500,
      queueTicketId: "queue-17", deliveryName: "Private recipient", deliveryAddress: "Private address",
      deliveryPhone: "Private phone", deliveryNote: "Private instruction", statusHistory: [],
      items: [{ id: "item", productName: "Noodles", quantity: 1, unitPrice: 2500, subtotal: 2500, specialInstruction: "No peanuts", modifiers: [] }]
    };
  } else if (key.startsWith("order-payments:")) {
    data = [{ id: "cash", method: "CASH_AT_COUNTER", status: "PENDING", amount: 2500, paidAt: null }];
  } else if (key.startsWith("queue:")) {
    data = [
      { ticketId: "queue-17", orderId: "order-17", displayCode: "017", status: "READY", createdAt: "2026-11-03T09:00:00Z" },
      { ticketId: "queue-18", displayCode: "018", status: "WAITING", createdAt: "2026-11-03T09:02:00Z" }
    ];
  } else if (key.startsWith("notifications:")) {
    data = [
      { id: "update", orderId: "order-17", notificationType: "DELIVERY_REASSIGNED", title: "Delivery reassigned",
        body: "You are no longer assigned to order T-17.", status: "PENDING", createdAt: "2026-11-03T09:05:00Z" }
    ];
  }
  return { state: { status: scenario.status, data }, reload: scenario.reload };
} }));
vi.mock("../../hooks/useApiMutation", () => ({ useApiMutation: () => ({ busy: scenario.busy, error: null, message: null }) }));
vi.mock("../../components/ui", () => ({
  Page: ({ title, children }: React.PropsWithChildren<{ title: string }>) => <main><h1>{title}</h1>{children}</main>,
  Card: ({ title, children }: React.PropsWithChildren<{ title?: string }>) => <section><h2>{title}</h2>{children}</section>,
  Body: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  Action: ({ title, disabled }: { title: string; disabled?: boolean }) => <button disabled={disabled}>{title}</button>,
  DataTable: () => null,
  ConfirmDialog: () => null,
  FormField: ({ label }: { label: string }) => <label>{label}<input /></label>,
  StateView: ({ kind, onRetry }: { kind: string; onRetry?: () => void }) => <aside>{kind}{onRetry ? <button>Try again</button> : null}</aside>
}));

import { DashboardScreen } from "./DashboardScreen";
import { NotificationsScreen } from "./NotificationsScreen";
import { OrderDetailScreen } from "./OrderDetailScreen";
import { OrdersScreen } from "./OrdersScreen";
import { QueueScreen } from "./QueueScreen";

const daily = scenario.daily;

beforeEach(() => {
  vi.stubGlobal("React", React);
  scenario.role = "MANAGER";
  scenario.status = "ready";
  scenario.orderType = "TAKEAWAY";
  scenario.orderStatus = "PREPARING";
  scenario.busy = false;
  scenario.daily = daily;
});

describe("Staff order and pickup workflow", () => {
  beforeEach(() => { scenario.role = "STAFF"; });

  it("shows preparation instructions, the permitted next step and counter cash collection", () => {
    const html = renderToStaticMarkup(<OrderDetailScreen orderId="order-17" />);
    expect(html).toContain("No peanuts");
    expect(html).toContain("Mark ready");
    expect(html).toContain("View pickup queue");
    expect(html).toContain("Confirm cash collected");
    expect(html).not.toContain("Cancel order");
    expect(html).not.toContain("Sales History");
  });

  it("keeps delivery destination and lifecycle actions in assigned Deliveries", () => {
    scenario.orderType = "DELIVERY";
    scenario.orderStatus = "READY";
    const html = renderToStaticMarkup(<OrderDetailScreen orderId="order-17" />);
    expect(html).toContain("Open your assigned deliveries");
    expect(html).not.toContain("Private");
    expect(html).not.toContain("Complete order");
    expect(html).not.toContain("Confirm cash collected");
  });

  it("links the ready queue ticket to its order and disables repeated calls while saving", () => {
    scenario.busy = true;
    const html = renderToStaticMarkup(<QueueScreen />);
    expect(html).toContain('<a href="/order/order-17">Open order for ticket 017</a>');
    expect(html).toContain('<button disabled="">Call for pickup</button>');
    expect(html.match(/>Call for pickup</g)).toHaveLength(1);
    expect(html).not.toContain("Open order for ticket 018");
  });

  it.each(["STAFF", "DELIVERY_DRIVER"])("sends %s reassignment updates to the assigned delivery list", role => {
    scenario.role = role;
    const html = renderToStaticMarkup(<NotificationsScreen />);
    expect(html).toContain("Delivery reassigned");
    expect(html).toContain('<a href="/deliveries">Open deliveries</a>');
    expect(html).not.toContain("Open order");
  });
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
