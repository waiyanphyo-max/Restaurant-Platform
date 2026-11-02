import { describe, expect, it, vi } from "vitest";
import type {
  CategoryResponse, DailyOperationsReportResponse, PaymentResponse, ProductManagementResponse,
  RestaurantMemberResponse, RestaurantSettingsResponse
} from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiProtocolError, createRestaurantMemberApiClient } from "./index.js";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const at = "2026-11-01T00:00:00Z";
const report = {
  restaurantId, reportDate: "2026-11-01", timezone: "Asia/Yangon", totalOrders: 2,
  pendingOrders: 1, acceptedOrders: 0, preparingOrders: 0, readyOrders: 0,
  outForDeliveryOrders: 0, completedOrders: 1, cancelledOrders: 0,
  orderAmountExcludingCancelled: 2000, paidAmount: 1000
} satisfies DailyOperationsReportResponse;
const product = {
  id: otherId, categoryId: otherId, name: "Rice", description: null, price: 1000,
  imageUrl: null, trackStock: false, stockQuantity: null, available: true, createdAt: at, updatedAt: at
} satisfies ProductManagementResponse;
const category = { id: otherId, name: "Meals", displayOrder: 0, active: true } satisfies CategoryResponse;
const member = {
  id: otherId, restaurantId, userId: otherId, email: "owner@example.test", fullName: null, role: "OWNER", createdAt: at
} satisfies RestaurantMemberResponse;
const settings = {
  restaurantId, currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 0, defaultDeliveryFee: 0,
  acceptsOrders: true, allowQrOrder: true, allowDelivery: true, allowTakeaway: true,
  defaultDeliveryDriverUserId: null
} satisfies RestaurantSettingsResponse;
const payment = {
  id: otherId, orderId, method: "CASH_AT_COUNTER", status: "PENDING", amount: 1000,
  paidAt: null, createdAt: at
} satisfies PaymentResponse;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
});
const clientFor = (fetchImpl: typeof fetch) => createRestaurantMemberApiClient({
  baseUrl: "https://api.example.test", restaurantId, getAccessToken: () => "current-token", fetchImpl
});

describe("operations read contracts", () => {
  it("uses only existing tenant-scoped GET routes and exact Java wire field names", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(report)).mockResolvedValueOnce(json([product]))
      .mockResolvedValueOnce(json([category])).mockResolvedValueOnce(json([member]))
      .mockResolvedValueOnce(json(settings)).mockResolvedValueOnce(json([payment]));
    const client = clientFor(fetchImpl);
    await expect(client.getDailyReport("2026-11-01")).resolves.toEqual(report);
    await expect(client.listProducts()).resolves.toEqual([product]);
    await expect(client.listCategories()).resolves.toEqual([category]);
    await expect(client.listMembers()).resolves.toEqual([member]);
    await expect(client.getSettings()).resolves.toEqual(settings);
    await expect(client.listOrderPayments(orderId)).resolves.toEqual([payment]);
    const paths = fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(["reports/daily", "products", "categories", "members", "settings", `orders/${orderId}/payments`]
      .map(path => `/api/v1/restaurants/${restaurantId}/${path}`));
    expect(new URL(String(fetchImpl.mock.calls[0][0])).search).toBe("?date=2026-11-01");
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.credentials).toBe("omit");
      expect((init?.headers as Headers).get("Authorization")).toBe("Bearer current-token");
    }
  });

  it("leaves the default business date to Spring and validates explicit calendar dates", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(report));
    const client = clientFor(fetchImpl);
    await client.getDailyReport();
    expect(new URL(String(fetchImpl.mock.calls[0][0])).search).toBe("");
    await client.getDailyReport("2024-02-29");
    for (const date of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-11-01T00:00:00Z", "01/11/2026", ""]) {
      await expect(client.getDailyReport(date)).rejects.toBeInstanceOf(ApiConfigurationError);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails closed on report/settings/member responses for a different restaurant", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ...report, restaurantId: otherId }))
      .mockResolvedValueOnce(json({ ...settings, restaurantId: otherId }))
      .mockResolvedValueOnce(json([{ ...member, restaurantId: otherId }]))
      .mockResolvedValueOnce(json({ content: [member] }));
    const client = clientFor(fetchImpl);
    await expect(client.getDailyReport()).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(client.getSettings()).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(client.listMembers()).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(client.listMembers()).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("validates order identifiers and payment ownership", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json([{ ...payment, orderId: otherId }]))
      .mockResolvedValueOnce(json({ content: [payment] }));
    const client = clientFor(fetchImpl);
    await expect(client.listOrderPayments("../other-restaurant")).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(client.listOrderPayments(orderId)).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(client.listOrderPayments(orderId)).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("preserves backend permission denials without returning financial data or retrying", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code: "INSUFFICIENT_RESTAURANT_PERMISSION" }, 403));
    await expect(clientFor(fetchImpl).getDailyReport()).rejects.toMatchObject({ status: 403, code: "INSUFFICIENT_RESTAURANT_PERMISSION" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
