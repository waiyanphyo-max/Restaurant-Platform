import { describe, expect, it, vi } from "vitest";
import { ApiConfigurationError, ApiNetworkError, ApiProtocolError, createRestaurantMemberApiClient } from "./index.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const child = "33333333-3333-4333-8333-333333333333";
const response = (data: unknown = {}) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const create = (fetchImpl: typeof fetch) => createRestaurantMemberApiClient({
  baseUrl: "https://api.example.test", restaurantId: tenant, getAccessToken: () => "verified-token", fetchImpl
});

describe("M8-A owner operation contracts", () => {
  it("uses existing menu writes, validates IDs and never invents product deletion", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response({ id }));
    const api = create(fetchImpl);
    await api.createCategory({ name: "Meals", active: true });
    await api.updateCategory(id, { name: "Meals", active: false });
    const product = { categoryId: id, name: "Rice", price: 1000, trackStock: true, stockQuantity: 2, available: true };
    await api.createProduct(product); await api.updateProduct(id, product);
    await api.listVariants(id); await api.createVariant(id, { name: "Large", price: 1500, available: true });
    await api.updateVariant(id, child, { name: "Large", price: 1600, available: false });
    await api.listModifierGroups(); await api.createModifierGroup({ name: "Spice", minSelections: 0, maxSelections: 1 });
    await api.updateModifierGroup(id, { name: "Spice", active: false });
    await api.createModifierOption(id, { name: "Hot", additionalPrice: 0, available: true });
    await api.updateModifierOption(id, child, { name: "Hot", additionalPrice: 100, available: false });
    await api.getProductModifierGroups(id);
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 204 })); await api.linkProductModifierGroup(id, child);
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 204 })); await api.unlinkProductModifierGroup(id, child);
    const paths = fetchImpl.mock.calls.map(([url, init]) => `${init?.method} ${new URL(String(url)).pathname.replace(`/api/v1/restaurants/${tenant}/`, "")}`);
    expect(paths).toEqual([
      "POST categories", `PUT categories/${id}`, "POST products", `PUT products/${id}`,
      `GET products/${id}/variants`, `POST products/${id}/variants`, `PUT products/${id}/variants/${child}`,
      "GET modifier-groups", "POST modifier-groups", `PUT modifier-groups/${id}`,
      `POST modifier-groups/${id}/options`, `PUT modifier-groups/${id}/options/${child}`,
      `GET products/${id}/modifier-groups`, `PUT products/${id}/modifier-groups/${child}`, `DELETE products/${id}/modifier-groups/${child}`
    ]);
    expect("deleteProduct" in api).toBe(false);
    expect(() => api.updateProduct("../other", product)).toThrow(ApiConfigurationError);
    expect(() => api.updateVariant(id, "../other", { name: "Bad", price: 0, available: true })).toThrow(ApiConfigurationError);
  });

  it("keeps invitation identity server-derived and restricts all management paths to the build tenant", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response({ restaurantId: tenant, id }));
    const api = create(fetchImpl);
    await api.inviteMember({ email: "staff@example.test", role: "STAFF" });
    await api.updateMember(id, { userId: child, role: "MANAGER" });
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 204 })); await api.removeMember(id);
    await api.transferOwnership({ newOwnerUserId: child });
    await api.updateSettings({ currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 0, defaultDeliveryFee: 1000,
      acceptsOrders: true, allowQrOrder: true, allowDelivery: true, allowTakeaway: true });
    await api.createTable({ tableNumber: "1" }); await api.updateTable(id, { tableNumber: "2", active: false });
    await api.rotateCommonQrToken(); await api.rotateTableQrToken(id);
    const invite = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(String(invite?.body))).toEqual({ email: "staff@example.test", role: "STAFF" });
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(new URL(String(url)).pathname).toMatch(new RegExp(`^/api/v1/restaurants/${tenant}/`));
      expect((init?.headers as Headers).get("Authorization")).toBe("Bearer verified-token");
      expect(init?.credentials).toBe("omit");
    }
  });

  it("scopes notifications, assignment options and cash collection without exposing the global personal inbox", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ id }))
      .mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ restaurantId: tenant, defaultDriverUserId: child }))
      .mockResolvedValueOnce(response({ restaurantId: tenant, defaultDriverUserId: child }))
      .mockResolvedValueOnce(response({ id: child, orderId: id, method: "CASH_AT_COUNTER", status: "PAID" }));
    const api = create(fetchImpl);
    await api.listNotifications("PENDING"); await api.markNotificationRead(id); await api.listDeliveryAssignmentOptions();
    await api.getDefaultDriver(); await api.setDefaultDriver({ driverUserId: child }); await api.collectPayment(id, child);
    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "notifications", `notifications/${id}/read`, "delivery-settings/assignment-options", "delivery-settings/default-driver",
      "delivery-settings/default-driver", `orders/${id}/payments/${child}/collect`
    ].map(path => `/api/v1/restaurants/${tenant}/${path}`));
  });

  it("uses tenant-scoped staff order options and posts a counter order once on a network failure", async () => {
    const options = { dineInEnabled: true, takeawayEnabled: false, tables: [{ id, tableLabel: "T1" }] };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response(options)).mockRejectedValue(new TypeError("network disconnected"));
    const api = create(fetchImpl);
    await expect(api.getStaffOrderOptions()).resolves.toEqual(options);
    const order = { orderType: "DINE_IN" as const, tableId: id, items: [{ productId: child, quantity: 2 }] };
    await expect(api.createStaffOrder(order)).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchImpl.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method])).toEqual([
      [`/api/v1/restaurants/${tenant}/orders/staff/options`, "GET"], [`/api/v1/restaurants/${tenant}/orders/staff`, "POST"]
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual(order);
    for (const [, init] of fetchImpl.mock.calls) expect((init?.headers as Headers).get("Authorization")).toBe("Bearer verified-token");
  });

  it("preserves native multipart body, fetch boundary and full upload response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ id, imageUrl: "https://media.example.test/image.png" }))
      .mockResolvedValueOnce(response({ id: child, productId: id, imageUrl: "https://media.example.test/variant.png" }))
      .mockResolvedValueOnce(response({ restaurantId: tenant, logoUrl: "https://media.example.test/logo.png" }));
    const api = create(fetchImpl);
    const form = new FormData(); form.append("file", new Blob(["png"], { type: "image/png" }), "meal.png");
    expect((await api.uploadProductImage(id, form)).id).toBe(id);
    expect((await api.uploadVariantImage(id, child, form)).id).toBe(child);
    await api.uploadRestaurantLogo(form);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.body).toBe(form);
      expect((init?.headers as Headers).get("Content-Type")).toBeNull();
      expect((init?.headers as Headers).get("Authorization")).toBe("Bearer verified-token");
    }
  });

  it("reports failed uploads and invitations once without duplicating a write on retry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network disconnected"));
    const api = create(fetchImpl);
    await expect(api.uploadProductImage(id, new FormData())).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(api.inviteMember({ email: "staff@example.test", role: "STAFF" })).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-restaurant management/payment response envelopes", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ restaurantId: child }))
      .mockResolvedValueOnce(response({ id: child, orderId: child }));
    const api = create(fetchImpl);
    await expect(api.rotateCommonQrToken()).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(api.collectPayment(id, child)).rejects.toBeInstanceOf(ApiProtocolError);
  });
});
