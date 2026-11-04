import { ApiCancelledError, ApiHttpError, ApiNetworkError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { AssignedDeliveryDetailDto } from "@restaurant-platform/shared-types";
import { describe, expect, it, vi } from "vitest";
import { assignedDeliveryUpdate, DeliveryAssignmentUnavailable, DeliveryChanged, readAssignedDelivery, recheckAssignedDelivery } from "./assigned-delivery";

const detail: AssignedDeliveryDetailDto = {
  task: {
    id: "delivery", orderId: "order", orderNumber: "R-012", orderStatus: "READY", status: "ASSIGNED",
    driverUserId: "current-user", customerName: "Recipient", customerPhone: null, deliveryAddress: "Order address", deliveryNote: null,
    totalAmount: 3500, assignedAt: "2026-11-03T10:00:00Z", pickedUpAt: null, deliveredAt: null, failureReason: null,
    createdAt: "2026-11-03T10:00:00Z", updatedAt: "2026-11-03T10:00:00.000001Z"
  },
  pickup: { name: "Restaurant", address: "Pickup address", latitude: 0, longitude: 0 },
  destination: { latitude: 17, longitude: 97 },
  items: [],
  cashCollectionRequired: true
};
const signal = () => new AbortController().signal;
const userId = "current-user";
const pickup = { status: "PICKED_UP", failureReason: "", note: "  From the counter  ", cashCollected: false };

describe("assigned delivery read and update preflight", () => {
  it("requires the matching delivery ID and authenticated assignee even if the client receives an unexpected record", async () => {
    const load = vi.fn().mockResolvedValue(detail);
    await expect(readAssignedDelivery(load, "different-delivery", userId, signal())).resolves.toBeNull();
    await expect(readAssignedDelivery(load, detail.task.id, "other-user", signal())).resolves.toBeNull();
    await expect(readAssignedDelivery(load, detail.task.id, userId, signal())).resolves.toBe(detail);
  });

  it.each([403, 404])("recognizes revocation or denied scope (%d) without returning private details", async status => {
    const load = vi.fn().mockRejectedValue(new ApiHttpError(status, "DELIVERY_NOT_FOUND"));
    await expect(recheckAssignedDelivery(load, detail, userId, signal())).rejects.toBeInstanceOf(DeliveryAssignmentUnavailable);
  });

  it.each([new ApiNetworkError(), new MissingAccessTokenError(), new ApiHttpError(401, "AUTHENTICATION_REQUIRED")])(
    "preserves offline and expired session errors for the existing workspace handling (%s)", async failure => {
      const load = vi.fn().mockRejectedValue(failure);
      await expect(recheckAssignedDelivery(load, detail, userId, signal())).rejects.toBe(failure);
    });

  it("rejects stale assignments and status changes even if the same assignee is selected again", async () => {
    const reassign = { ...detail, task: { ...detail.task, updatedAt: "2026-11-03T10:00:00.000002Z" } };
    await expect(recheckAssignedDelivery(vi.fn().mockResolvedValue(reassign), detail, userId, signal())).rejects.toBeInstanceOf(DeliveryChanged);
    const orderChanged = { ...detail, task: { ...detail.task, orderStatus: "CANCELLED" } };
    await expect(recheckAssignedDelivery(vi.fn().mockResolvedValue(orderChanged), detail, userId, signal())).rejects.toBeInstanceOf(DeliveryChanged);
  });

  it("drops a detail result if the user leaves the screen during verification", async () => {
    const controller = new AbortController();
    const load = vi.fn(async () => { controller.abort(); return detail; });
    await expect(recheckAssignedDelivery(load, detail, userId, controller.signal)).rejects.toBeInstanceOf(ApiCancelledError);
  });

  it.each(["STAFF", "DELIVERY_DRIVER", "OWNER", "MANAGER"])("builds a guarded pickup action for assigned %s", role => {
    expect(assignedDeliveryUpdate(detail, role, userId, pickup)).toEqual({
      status: "PICKED_UP", failureReason: null, note: "From the counter", cashCollected: null,
      expectedUpdatedAt: detail.task.updatedAt
    });
    expect(() => assignedDeliveryUpdate(detail, role, "other-user", pickup)).toThrow(DeliveryAssignmentUnavailable);
  });

  it("requires a reason for failure and records it separately from the note", () => {
    expect(() => assignedDeliveryUpdate(detail, "STAFF", userId, { ...pickup, status: "FAILED" })).toThrow("Enter a reason");
    expect(assignedDeliveryUpdate(detail, "STAFF", userId, { ...pickup, status: "FAILED", failureReason: " Recipient unavailable " }))
      .toMatchObject({ failureReason: "Recipient unavailable", note: "From the counter" });
  });

  it("requires COD acknowledgement only for delivery completion and prevents repeating pickup", () => {
    const pickedUp = { ...detail, task: { ...detail.task, status: "PICKED_UP", orderStatus: "OUT_FOR_DELIVERY" } };
    const complete = { ...pickup, status: "DELIVERED" };
    expect(() => assignedDeliveryUpdate(pickedUp, "DELIVERY_DRIVER", userId, pickup)).toThrow(DeliveryChanged);
    expect(() => assignedDeliveryUpdate(pickedUp, "DELIVERY_DRIVER", userId, complete)).toThrow("Confirm you received the cash");
    expect(assignedDeliveryUpdate(pickedUp, "DELIVERY_DRIVER", userId, { ...complete, cashCollected: true })).toMatchObject({ cashCollected: true });
    expect(assignedDeliveryUpdate({ ...pickedUp, cashCollectionRequired: false }, "DELIVERY_DRIVER", userId, complete)).toMatchObject({ cashCollected: false });
  });
});
