import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssignedDeliveryDetailDto } from "@restaurant-platform/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scenario = vi.hoisted(() => ({
  detail: null as AssignedDeliveryDetailDto | null,
  role: "DELIVERY_DRIVER",
  status: "ready"
}));

vi.mock("react-native", () => ({ Linking: { openURL: vi.fn() } }));
vi.mock("expo-router", () => ({ Link: ({ children }: React.PropsWithChildren) => <a>{children}</a> }));
vi.mock("../../api", () => ({ getOperationsApi: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: {
  status: "ready", userId: "current-user", membership: { role: scenario.role }
} }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: () => ({
  state: { status: scenario.status, data: scenario.detail }, reload: vi.fn()
}) }));
vi.mock("../../hooks/useApiMutation", () => ({ useApiMutation: () => ({ busy: false, error: null, message: null }) }));
vi.mock("../../components/forms", () => ({
  FormToggle: ({ label }: { label: string }) => <label>{label}</label>,
  MutationFeedback: () => null
}));
vi.mock("../../components/ui", () => ({
  Page: ({ title, children }: React.PropsWithChildren<{ title: string }>) => <main><h1>{title}</h1>{children}</main>,
  Card: ({ title, children }: React.PropsWithChildren<{ title: string }>) => <section><h2>{title}</h2>{children}</section>,
  Body: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  Action: ({ title, disabled }: { title: string; disabled?: boolean }) => <button disabled={disabled}>{title}</button>,
  ConfirmDialog: () => null,
  FormField: ({ label }: { label: string }) => <label>{label}</label>,
  StateView: ({ kind, title, message }: { kind: string; title?: string; message?: string }) => <aside>{title ?? kind} {message}</aside>
}));

import { DeliveryDetailScreen } from "./DeliveryDetailScreen";

const detail: AssignedDeliveryDetailDto = {
  task: {
    id: "delivery", orderId: "order", orderNumber: "R-012", orderStatus: "READY", status: "ASSIGNED",
    driverUserId: "current-user", customerName: "Recipient", customerPhone: "555-0123", deliveryAddress: "Order-specific address",
    deliveryNote: "Ring the bell", totalAmount: 3500, assignedAt: null, pickedUpAt: null, deliveredAt: null, failureReason: null,
    createdAt: "2026-11-03T10:00:00Z", updatedAt: "2026-11-03T10:00:00Z"
  },
  pickup: { name: "Restaurant", address: "Pickup address", latitude: 0, longitude: 0 },
  destination: { latitude: 17, longitude: 97 },
  items: [{ id: "item", productName: "Soup", variantName: null, quantity: 2, specialInstruction: "Pack separately" }],
  cashCollectionRequired: true
};

beforeEach(() => {
  vi.stubGlobal("React", React);
  scenario.detail = detail;
  scenario.status = "ready";
  scenario.role = "DELIVERY_DRIVER";
});

describe("assigned delivery detail", () => {
  it("renders four Maps actions, the order destination and task instructions without the general order link for a dedicated driver", () => {
    const html = renderToStaticMarkup(<DeliveryDetailScreen deliveryId="delivery" />);
    for (const action of ["View Pickup on Map", "Navigate to Pickup", "View Delivery Location", "Navigate to Customer"]) {
      expect(html).toContain(`<button>${action}</button>`);
    }
    expect(html).toContain("Latitude 0 · Longitude 0");
    expect(html).toContain("Order-specific address");
    expect(html).toContain("555-0123");
    expect(html).toContain("Ring the bell");
    expect(html).toContain("Pack separately");
    expect(html).not.toContain("Open restaurant order");
  });

  it("lets staff use the regular order route and retains the text when the destination has no coordinates", () => {
    scenario.role = "STAFF";
    scenario.detail = { ...detail, destination: { latitude: null, longitude: null } };
    const html = renderToStaticMarkup(<DeliveryDetailScreen deliveryId="delivery" />);
    expect(html).toContain("Open restaurant order");
    expect(html).toContain("Order-specific address");
    expect(html).toContain("This location has no verified coordinates.");
    expect(html).toContain('<button disabled="">Navigate to Customer</button>');
    expect(html).toContain("<button>Navigate to Pickup</button>");
  });

  it("shows a reassignment state without private information once the task is revoked", () => {
    scenario.detail = null;
    const html = renderToStaticMarkup(<DeliveryDetailScreen deliveryId="delivery" />);
    expect(html).toContain("This delivery may have been reassigned or is no longer available");
    expect(html).not.toContain("Order-specific address");
    expect(html).not.toContain("Navigate to Customer");
  });

  it("keeps offline reads from rendering stale location and status actions", () => {
    scenario.status = "offline";
    const html = renderToStaticMarkup(<DeliveryDetailScreen deliveryId="delivery" />);
    expect(html).toContain("Reconnect to load current restaurant data.");
    expect(html).not.toContain("Order-specific address");
    expect(html).not.toContain("Mark picked up");
  });
});
