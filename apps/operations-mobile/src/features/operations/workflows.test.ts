import { describe, expect, it } from "vitest";
import type { DeliveryTaskDto, OrderSummaryDto } from "@restaurant-platform/shared-types";
import { canCollectPayment, deliveryActions, orderActions, searchOrders } from "./workflows";

const delivery: DeliveryTaskDto = {
  id: "delivery", orderId: "order", orderNumber: "R-012", orderStatus: "READY", status: "ASSIGNED", driverUserId: "driver-a",
  customerName: "Customer", customerPhone: null, deliveryAddress: "Yangon", deliveryNote: null, totalAmount: 3500,
  assignedAt: "2026-11-02T10:00:00Z", pickedUpAt: null, deliveredAt: null, failureReason: null,
  createdAt: "2026-11-02T10:00:00Z", updatedAt: "2026-11-02T10:00:00Z"
};

describe("Owner order actions against ManagerOrderService transitions", () => {
  it.each([
    ["PENDING", "DINE_IN", ["ACCEPTED", "CANCELLED"]],
    ["ACCEPTED", "TAKEAWAY", ["PREPARING", "CANCELLED"]],
    ["PREPARING", "DELIVERY", ["READY", "CANCELLED"]],
    ["READY", "DINE_IN", ["COMPLETED"]],
    ["READY", "TAKEAWAY", ["COMPLETED"]],
    ["COMPLETED", "DINE_IN", []],
    ["CANCELLED", "TAKEAWAY", []],
    ["UNKNOWN", "DINE_IN", []]
  ] as const)("offers only backend-supported actions from %s/%s", (status, orderType, expected) => {
    expect(orderActions({ status, orderType }, "OWNER")).toEqual(expected);
    expect(orderActions({ status, orderType }, "MANAGER")).toEqual(expected);
  });

  it("routes delivery progress through DeliveryService rather than bypassing cash confirmation", () => {
    expect(orderActions({ status: "READY", orderType: "DELIVERY" }, "OWNER")).toEqual([]);
    expect(orderActions({ status: "OUT_FOR_DELIVERY", orderType: "DELIVERY" }, "MANAGER")).toEqual([]);
  });

  it("does not offer cancellation to Staff or order mutations to Drivers or unknown roles", () => {
    expect(orderActions({ status: "PENDING", orderType: "TAKEAWAY" }, "STAFF")).toEqual(["ACCEPTED"]);
    expect(orderActions({ status: "ACCEPTED", orderType: "TAKEAWAY" }, "STAFF")).toEqual(["PREPARING"]);
    expect(orderActions({ status: "PREPARING", orderType: "TAKEAWAY" }, "STAFF")).toEqual(["READY"]);
    expect(orderActions({ status: "READY", orderType: "TAKEAWAY" }, "STAFF")).toEqual(["COMPLETED"]);
    expect(orderActions({ status: "READY", orderType: "DELIVERY" }, "STAFF")).toEqual([]);
    for (const role of ["DELIVERY_DRIVER", "PLATFORM_ADMIN", "CUSTOMER", "", "owner"]) {
      expect(orderActions({ status: "PENDING", orderType: "DINE_IN" }, role)).toEqual([]);
    }
  });
});

describe("delivery actions and assignment boundaries", () => {
  it.each([
    ["WAITING_ASSIGNMENT", "READY", ["CANCELLED"]],
    ["ASSIGNED", "READY", ["PICKED_UP", "FAILED", "CANCELLED"]],
    ["PICKED_UP", "OUT_FOR_DELIVERY", ["DELIVERED", "FAILED"]],
    ["FAILED", "OUT_FOR_DELIVERY", []],
    ["DELIVERED", "COMPLETED", []],
    ["CANCELLED", "READY", []]
  ] as const)("offers management actions for %s with order %s", (status, orderStatus, expected) => {
    for (const role of ["OWNER", "MANAGER"]) {
      expect(deliveryActions({ ...delivery, status, orderStatus }, role, "manager-user")).toEqual(expected);
    }
  });

  it("rejects actions when the linked order state does not agree", () => {
    expect(deliveryActions({ ...delivery, orderStatus: "PREPARING" }, "OWNER", "owner")).toEqual([]);
    expect(deliveryActions({ ...delivery, status: "PICKED_UP", orderStatus: "READY" }, "OWNER", "owner")).toEqual([]);
  });

  it("only offers Driver actions for the verified assigned user", () => {
    expect(deliveryActions(delivery, "DELIVERY_DRIVER", "driver-a")).toEqual(["PICKED_UP", "FAILED"]);
    expect(deliveryActions(delivery, "DELIVERY_DRIVER", "driver-b")).toEqual([]);
    expect(deliveryActions({ ...delivery, driverUserId: null }, "DELIVERY_DRIVER", "driver-a")).toEqual([]);
    expect(deliveryActions({ ...delivery, status: "PICKED_UP", orderStatus: "OUT_FOR_DELIVERY" }, "DELIVERY_DRIVER", "driver-a")).toEqual(["DELIVERED", "FAILED"]);
  });

  it("keeps Staff UI at its existing assigned-task scope and never offers management cancellation", () => {
    expect(deliveryActions(delivery, "STAFF", "driver-a")).toEqual(["PICKED_UP", "FAILED"]);
    expect(deliveryActions(delivery, "STAFF", "other-staff")).toEqual([]);
    expect(deliveryActions({ ...delivery, status: "WAITING_ASSIGNMENT", driverUserId: "staff" }, "STAFF", "staff")).toEqual([]);
    for (const role of ["PLATFORM_ADMIN", "CUSTOMER", "", "owner"]) expect(deliveryActions(delivery, role, "driver-a")).toEqual([]);
  });
});

describe("cash-first payment safeguards", () => {
  it("does not infer cash collection from order acceptance or completion", () => {
    expect(canCollectPayment({ method: "CASH_AT_COUNTER", status: "PENDING" }, "PENDING")).toBe(true);
    expect(canCollectPayment({ method: "CASH_AT_COUNTER", status: "PENDING" }, "COMPLETED")).toBe(true);
    expect(canCollectPayment({ method: "CASH_AT_COUNTER", status: "PENDING" }, "CANCELLED")).toBe(false);
  });

  it.each(["PAID", "CANCELLED", "FAILED", "REFUNDED", "UNKNOWN"])("does not offer repeated collection for payment %s", status => {
    expect(canCollectPayment({ method: "CASH_AT_COUNTER", status }, "COMPLETED")).toBe(false);
  });

  it("never collects COD or unsupported online methods through the counter endpoint", () => {
    for (const method of ["CASH_ON_DELIVERY", "CARD", "ONLINE", "UNKNOWN", ""]) {
      expect(canCollectPayment({ method, status: "PENDING" }, "READY")).toBe(false);
    }
  });
});

describe("order search on the explicitly loaded page", () => {
  const orders: OrderSummaryDto[] = [
    { id: "uuid-a", orderNumber: "R-100", orderType: "DINE_IN", orderChannel: "TABLE_QR", status: "READY", subtotal: 3000, deliveryFee: 0, totalAmount: 3000, createdAt: "2026-11-02T01:00:00Z" },
    { id: "uuid-b", orderNumber: "R-101", orderType: "TAKEAWAY", orderChannel: "COMMON_QR", status: "PENDING", subtotal: 2500, deliveryFee: 0, totalAmount: 2500, createdAt: "2026-11-02T02:00:00Z" }
  ];
  it("matches number, ID and order type without changing source records", () => {
    expect(searchOrders(orders, "  r-101 ", "")).toEqual([orders[1]]);
    expect(searchOrders(orders, "UUID-A", "")).toEqual([orders[0]]);
    expect(searchOrders(orders, "takeaway", "COMMON_QR")).toEqual([orders[1]]);
    expect(searchOrders(orders, "R-101", "TABLE_QR")).toEqual([]);
    expect(searchOrders(orders, "", "")).toHaveLength(2);
    expect(orders[0].status).toBe("READY");
  });
});
