import { describe, expect, it, vi } from "vitest";
import type { DeliveryQuoteRequest } from "@restaurant-platform/shared-types";
import { ApiProtocolError, createCustomerApiClient, MissingAccessTokenError } from "./index.js";

const restaurantId = "d7695964-9b50-455a-9065-620e49a9b947";
const foreignRestaurant = "3bc069f1-61eb-4130-b4dc-76421577d96d";
const orderId = "f44dd590-28fa-42bf-8880-ebc4405f38f3";
const key = "1c2fdc51-bc4f-4de9-86bf-5aac551327fd";
const prefix = `/api/v1/customer/restaurants/${restaurantId}`;
const body: DeliveryQuoteRequest = {
  temporaryDestination: { source: "MANUAL_MAP", address: "12 Main Rd", city: "Yangon", township: "Tamwe", latitude: 16.82, longitude: 96.16 },
  recipientName: "Customer", recipientPhone: "0912345678", items: [{ productId: orderId, quantity: 1 }]
};

function setup() {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ restaurantId }));
  const getAccessToken = vi.fn().mockResolvedValue("customer-jwt");
  const api = createCustomerApiClient({ restaurantId, baseUrl: "https://api.example.test", fetchImpl, getAccessToken });
  return { api, fetchImpl, getAccessToken };
}

describe("restaurant- and identity-scoped customer delivery transport", () => {
  it("uses the configured tenant and sends the temporary destination only in the quote body", async () => {
    const { api, fetchImpl } = setup();
    await api.quoteDelivery(body);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test${prefix}/orders/delivery/quote`);
    expect(request).toMatchObject({ method: "POST", cache: "no-store", body: JSON.stringify(body) });
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer customer-jwt");
  });

  it("retries the same confirmed checkout body and key after a lost network response", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockRejectedValueOnce(new Error("connection lost"));
    const checkout = { ...body, confirmationToken: "a".repeat(64) };
    await api.checkoutDelivery(checkout, key);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url, request] of fetchImpl.mock.calls) {
      expect(String(url)).toBe(`https://api.example.test${prefix}/orders/delivery/checkout`);
      expect(request?.body).toBe(JSON.stringify(checkout));
      expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(key);
    }
  });

  it("looks up an interrupted checkout using only its opaque request header", async () => {
    const { api, fetchImpl } = setup();
    await api.getCheckoutReceipt(key);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test${prefix}/orders/delivery/checkout`);
    expect(request?.method).toBe("GET");
    expect(request?.body).toBeUndefined();
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(key);
  });

  it("routes detail, cancellation, notifications, and pagination through the locked restaurant", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValueOnce(Response.json({ content: [{ restaurantId }] }));
    await api.listOrders({ page: 1, size: 5 });
    for (const run of [() => api.getOrder(orderId), () => api.cancelOrder(orderId), () => api.listNotifications(), () => api.markNotificationRead(orderId)]) {
      fetchImpl.mockResolvedValueOnce(Response.json({ restaurantId }));
      await run();
    }
    expect(fetchImpl.mock.calls.map(([url, request]) => [request?.method, String(url).replace("https://api.example.test", "")])).toEqual([
      ["GET", `${prefix}/orders?page=1&size=5`], ["GET", `${prefix}/orders/${orderId}`],
      ["POST", `${prefix}/orders/${orderId}/cancel`], ["GET", `${prefix}/notifications`], ["PATCH", `${prefix}/notifications/${orderId}/read`]
    ]);
  });

  it("rejects a foreign restaurant in the quote, list, or order response", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValueOnce(Response.json({ restaurantId: foreignRestaurant }))
      .mockResolvedValueOnce(Response.json({ content: [{ restaurantId: foreignRestaurant }] }))
      .mockResolvedValueOnce(Response.json({ restaurantId: foreignRestaurant }));
    await expect(api.quoteDelivery(body)).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(api.listOrders()).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(api.getOrder(orderId)).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("refuses to submit after session loss", async () => {
    const { api, fetchImpl, getAccessToken } = setup();
    getAccessToken.mockResolvedValue(null);
    await expect(api.checkoutDelivery({ ...body, confirmationToken: "a".repeat(64) }, key)).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
