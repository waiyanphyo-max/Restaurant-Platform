import { describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { getOperationsApi } from "../../api";
import { loadDashboardOverview, attentionStatuses } from "./dashboard-overview";

function api() {
  return {
    listOrders: vi.fn<(_filter?: unknown, _options?: unknown) => Promise<{ totalElements: number }>>().mockResolvedValue({ totalElements: 3 }), listQueue: vi.fn(async () => []),
    listDeliveries: vi.fn<(_filter?: unknown, _options?: unknown) => Promise<{ totalElements: number; content: never[] }>>().mockResolvedValue({ totalElements: 2, content: [] }),
    listMyDeliveries: vi.fn(async () => ({ totalElements: 1, content: [{ id: "task", orderNumber: "Order 1", status: "ASSIGNED", customerName: "Private recipient", customerPhone: "Private phone", deliveryAddress: "Private address", deliveryNote: "Private note" }] })),
    listNotifications: vi.fn(async () => []), getDailyReport: vi.fn(async () => ({ totalOrders: 4 })),
  };
}
const load = (client: ReturnType<typeof api>, role: "OWNER" | "MANAGER" | "STAFF" | "DELIVERY_DRIVER") =>
  loadDashboardOverview(client as unknown as ReturnType<typeof getOperationsApi>, role, new AbortController().signal);

describe("UXI-10 dashboard data scope and partial states", () => {
  it.each(["OWNER", "MANAGER"] as const)("loads permitted %s attention without duplicate identical requests", async role => {
    const client = api();
    const data = await load(client, role);
    expect(client.listOrders.mock.calls.map(call => call[0])).toEqual(attentionStatuses.map(status => ({ status, size: 1 })));
    expect(client.listDeliveries.mock.calls.map(call => call[0])).toEqual([{ size: 5 }, { status: "WAITING_ASSIGNMENT", size: 1 }]);
    expect(client.listMyDeliveries).not.toHaveBeenCalled();
    expect(data.assignment).toEqual({ status: "ready", data: 2 });
    expect(client.getDailyReport).toHaveBeenCalledTimes(1);
  });

  it("keeps Staff operational counts and only self-assigned deliveries without financial requests", async () => {
    const client = api();
    const data = await load(client, "STAFF");
    expect(client.listOrders).toHaveBeenCalledTimes(5);
    expect(client.listQueue).toHaveBeenCalledTimes(1);
    expect(client.listMyDeliveries).toHaveBeenCalledTimes(1);
    expect(client.listDeliveries).not.toHaveBeenCalled();
    expect(client.getDailyReport).not.toHaveBeenCalled();
    expect(data.daily).toBeNull();
    expect(data.assignment).toBeNull();
  });

  it("loads only assigned delivery and inbox data for Driver and strips private task fields", async () => {
    const client = api();
    const data = await load(client, "DELIVERY_DRIVER");
    for (const method of [client.listOrders, client.listQueue, client.listDeliveries, client.getDailyReport]) expect(method).not.toHaveBeenCalled();
    expect(data.orders).toBeNull();
    expect(data.queue).toBeNull();
    expect(data.deliveries).toEqual({ status: "ready", data: { totalElements: 1, content: [{ id: "task", orderNumber: "Order 1", status: "ASSIGNED" }] } });
    expect(JSON.stringify(data)).not.toContain("Private");
  });

  it("does not turn one failed status count or auxiliary request into false zeros", async () => {
    const client = api();
    client.listOrders.mockRejectedValueOnce(new ApiNetworkError());
    client.getDailyReport.mockRejectedValue(new Error("unavailable"));
    const data = await load(client, "MANAGER");
    expect(data.orders?.[0]).toEqual({ status: "offline" });
    expect(data.orders?.[1]).toEqual({ status: "ready", data: 3 });
    expect(data.daily).toEqual({ status: "error" });
    expect(data.deliveries.status).toBe("ready");
    expect(data.queue).toEqual({ status: "ready", data: [] });
  });

  it("keeps a forbidden auxiliary section distinct from offline and successful data", async () => {
    const client = api();
    client.listQueue.mockRejectedValue(new ApiHttpError(403, "FORBIDDEN"));
    const data = await load(client, "MANAGER");
    expect(data.queue).toEqual({ status: "denied" });
    expect(data.daily?.status).toBe("ready");
  });

  it.each([new MissingAccessTokenError(), new ApiHttpError(401, "EXPIRED")])("delegates expired sessions to the existing query hook", async error => {
    const client = api();
    client.listNotifications.mockRejectedValue(error);
    await expect(load(client, "STAFF")).rejects.toBe(error);
  });
});
