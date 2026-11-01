import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleGuestApi } from "./guest-api";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), configs: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@restaurant-platform/restaurant-config", () => ({ listRestaurantConfigs: mocks.configs }));

const a = { restaurantId: "11111111-1111-4111-8111-111111111111", slug: "garden", branding: { displayName: "Garden", primaryColor: "#147D64" }, guestDomains: { staging: ["garden.test"], production: ["garden.test"] } };
const b = { restaurantId: "22222222-2222-4222-8222-222222222222", slug: "tea", branding: { displayName: "Tea", primaryColor: "#294a37" }, guestDomains: { staging: ["tea.test"], production: ["tea.test"] } };
const productId = "33333333-3333-4333-8333-333333333333";
const tableId = "44444444-4444-4444-8444-444444444444";
const ticketId = "55555555-5555-4555-8555-555555555555";
const orderId = "66666666-6666-4666-8666-666666666666";
const noticeId = "77777777-7777-4777-8777-777777777777";
const qrToken = "private-qr-credential";
const queueToken = "private-queue-token";
const baseUrl = "http://localhost:8080";
const checkout = { action: "checkout", kind: "COMMON_QR", qrToken, items: [{ productId, quantity: 2, specialInstruction: "Less sweet", modifiers: [] }], idempotencyKey: "checkout-safe-retry-key" };

function order(kind = "COMMON_QR") {
  return { orderId, orderNumber: "20261101-0001", orderType: kind === "COMMON_QR" ? "TAKEAWAY" : "DINE_IN", orderChannel: kind, status: "PENDING", currency: "MMK", subtotal: 4200, deliveryFee: 0, discountAmount: 0, totalAmount: 4200,
    queue: kind === "COMMON_QR" ? { ticketId, queueNumber: 1, displayCode: "A001", status: "WAITING", trackingToken: queueToken } : null };
}
function status() {
  return { ticketId, queueNumber: 1, displayCode: "A001", queueStatus: "READY", orderNumber: "20261101-0001", orderStatus: "READY", createdAt: "2026-11-01T10:00:00+06:30", readyAt: "2026-11-01T10:05:00+06:30", calledAt: null, completedAt: null };
}
function notification() {
  return { id: noticeId, orderId, queueTicketId: ticketId, notificationType: "ORDER_READY", title: "Your order is ready", body: "Please collect your order", channel: "IN_APP", status: "PENDING", createdAt: "2026-11-01T10:05:00+06:30", readAt: null };
}
function request(body: unknown, host = "garden.test", extra: Record<string, string> = {}, search = "") {
  mocks.headers.mockResolvedValue(new Headers({ host, "x-forwarded-host": "tea.test", "x-restaurant-id": b.restaurantId }));
  return new Request(`https://${host}/api/guest${search}`, { method: "POST", headers: { "content-type": "application/json", host, origin: `https://${host}`, cookie: "private-session-cookie", authorization: "Bearer secret", ...extra }, body: JSON.stringify(body) });
}
function fetchResponse(value: unknown, code = 200) {
  return vi.fn<typeof fetch>().mockImplementation(async () => Response.json(value, { status: code }));
}
async function invoke(body: unknown, fetchImpl: typeof fetch, host = "garden.test", extra: Record<string, string> = {}, search = "") {
  const response = await handleGuestApi(request(body, host, extra, search), undefined, { baseUrl, fetchImpl });
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.stubEnv("GUEST_CONFIG_ENV", "production");
  mocks.configs.mockReturnValue([a, b]);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("guest same-origin QR context", () => {
  it.each([a, b])("validates each restaurant's own context using only its canonical host: $slug", async restaurant => {
    const fetchImpl = fetchResponse({ restaurantId: restaurant.restaurantId, kind: "TABLE_QR", tableId, tableNumber: "T7", qrToken: "never-forward", internalNotes: "private" });
    const { response, body } = await invoke({ action: "validate", kind: "TABLE_QR", qrToken }, fetchImpl, restaurant.guestDomains.production[0]);
    expect(body).toEqual({ ok: true, data: { restaurantId: restaurant.restaurantId, kind: "TABLE_QR", tableId, tableNumber: "T7" } });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const [target, init] = fetchImpl.mock.calls[0];
    expect(String(target)).toBe(`${baseUrl}/api/v1/public/restaurants/${restaurant.restaurantId}/qr-context`);
    expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
    expect(JSON.parse(String(init?.body))).toEqual({ kind: "TABLE_QR", qrToken });
    const headers = new Headers(init?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("x-forwarded-host")).toBe(false);
    expect(headers.has("x-restaurant-id")).toBe(false);
    expect(String(target)).not.toContain(qrToken);
    expect(JSON.stringify(body)).not.toContain("never-forward");
  });

  it("validates Common QR without a fabricated table", async () => {
    const { body } = await invoke({ action: "validate", kind: "COMMON_QR", qrToken }, fetchResponse({ restaurantId: a.restaurantId, kind: "COMMON_QR", tableId: null, tableNumber: null }));
    expect(body).toEqual({ ok: true, data: { restaurantId: a.restaurantId, kind: "COMMON_QR", tableId: null, tableNumber: null } });
  });

  it.each([
    { restaurantId: b.restaurantId, kind: "TABLE_QR", tableId, tableNumber: "Other restaurant private table" },
    { restaurantId: a.restaurantId, kind: "COMMON_QR", tableId: null, tableNumber: null },
    { restaurantId: a.restaurantId, kind: "TABLE_QR", tableId: null, tableNumber: null },
  ])("rejects a mismatched or malformed upstream context before exposing it", async context => {
    const { body } = await invoke({ action: "validate", kind: "TABLE_QR", qrToken }, fetchResponse(context));
    expect(body).toEqual({ ok: false, error: "retry", retryable: true, ambiguous: false });
    expect(JSON.stringify(body)).not.toContain("Other restaurant");
  });

  it("does not fetch for unknown hosts, including a forged forwarded host", async () => {
    const fetchImpl = fetchResponse({});
    const { body, response } = await invoke({ action: "validate", kind: "COMMON_QR", qrToken }, fetchImpl, "unknown.test");
    expect(response.status).toBe(404);
    expect(body.error).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves validated localhost slug routing while refusing a second tenant on a public host", async () => {
    vi.stubEnv("GUEST_CONFIG_ENV", "staging");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GUEST_LOCAL_ROUTING", "true");
    const fetchImpl = fetchResponse({ restaurantId: b.restaurantId, kind: "COMMON_QR", tableId: null, tableNumber: null });
    const local = request({ action: "validate", kind: "COMMON_QR", qrToken }, "localhost:3002");
    const response = await handleGuestApi(local, "tea", { baseUrl, fetchImpl });
    expect((await response.json()).data.restaurantId).toBe(b.restaurantId);
    const wrong = request({ action: "validate", kind: "COMMON_QR", qrToken });
    const refused = await handleGuestApi(wrong, "tea", { baseUrl, fetchImpl });
    expect(refused.status).toBe(404);
  });
});

describe("checkout response and idempotency", () => {
  it.each(["COMMON_QR", "TABLE_QR"])("uses the existing %s contract and a required Idempotency-Key", async kind => {
    const fetchImpl = fetchResponse({ ...order(kind), qrToken: "never-forward", rawRequest: "private" });
    const { body } = await invoke({ ...checkout, kind }, fetchImpl);
    expect(body).toEqual({ ok: true, data: order(kind) });
    const [target, init] = fetchImpl.mock.calls[0];
    expect(String(target)).toBe(`${baseUrl}/api/v1/public/restaurants/${a.restaurantId}/orders/${kind === "COMMON_QR" ? "common-qr" : "table-qr"}`);
    const headers = new Headers(init?.headers);
    expect(headers.get("Idempotency-Key")).toBe(checkout.idempotencyKey);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("Cookie")).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({ qrToken, items: [{ ...checkout.items[0], variantId: null }] });
  });

  it("retries a lost checkout response with exactly the same key and body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("socket disconnected with a credential-bearing URL")).mockImplementation(async () => Response.json(order()));
    const { body } = await invoke(checkout, fetchImpl);
    expect(body.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(fetchImpl.mock.calls[1][1]?.body);
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("Idempotency-Key"));
  });

  it.each([
    { ...order(), orderType: "DINE_IN" },
    { ...order(), orderChannel: "TABLE_QR" },
    { ...order(), totalAmount: 100 },
    { ...order(), totalAmount: Number.MAX_SAFE_INTEGER + 1 },
    { ...order(), queue: null },
  ])("keeps malformed successful checkouts ambiguous because the order may already exist", async upstream => {
    const { body } = await invoke(checkout, fetchResponse(upstream));
    expect(body).toEqual({ ok: false, error: "retry", retryable: true, ambiguous: true });
  });

  it.each([
    [403, "INVALID_COMMON_QR_TOKEN", "invalid-qr", false],
    [403, "INVALID_TABLE_QR_TOKEN", "invalid-qr", false],
    [409, "INSUFFICIENT_STOCK", "selection", false],
    [409, "PRODUCT_UNAVAILABLE", "selection", false],
    [400, "INVALID_MODIFIER_SELECTION_COUNT", "selection", false],
    [400, "INVALID_PRODUCT", "selection", false],
    [409, "QR_ORDERING_DISABLED", "unavailable", false],
    [409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "conflict", true],
    [409, "IDEMPOTENCY_KEY_REUSED", "conflict", true],
    [503, "IDEMPOTENCY_ENCRYPTION_NOT_CONFIGURED", "configuration", false],
    [500, "INTERNAL_ERROR", "retry", true],
  ])("maps HTTP %i %s without leaking upstream messages", async (code, upstreamCode, expectedError, ambiguous) => {
    const { body } = await invoke(checkout, fetchResponse({ code: upstreamCode, message: `${qrToken} ${queueToken} sql secret`, errors: [{ field: "qrToken", message: qrToken }] }, code as number));
    expect(body).toMatchObject({ ok: false, error: expectedError, ambiguous });
    expect(JSON.stringify(body)).not.toContain(qrToken);
    expect(JSON.stringify(body)).not.toContain(queueToken);
    expect(JSON.stringify(body)).not.toContain("sql");
  });
});

describe("queue capability transport", () => {
  it.each([a, b])("always scopes status to the current restaurant $slug and sends the queue token only in a header", async restaurant => {
    const fetchImpl = fetchResponse({ ...status(), privateMetadata: "never-forward" });
    const { body } = await invoke({ action: "status", ticketId, queueToken }, fetchImpl, restaurant.guestDomains.production[0]);
    expect(body).toEqual({ ok: true, data: status() });
    const [target, init] = fetchImpl.mock.calls[0];
    expect(String(target)).toBe(`${baseUrl}/api/v1/public/queue-tickets/${ticketId}/status`);
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Queue-Token")).toBe(queueToken);
    expect(headers.get("X-Restaurant-Id")).toBe(restaurant.restaurantId);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(String(target)).not.toContain(queueToken);
  });

  it("returns generic invalid capability for a wrong-tenant ticket or stale queue token", async () => {
    const { body } = await invoke({ action: "status", ticketId, queueToken }, fetchResponse({ code: "QUEUE_TICKET_NOT_FOUND", message: queueToken }, 404));
    expect(body).toEqual({ ok: false, error: "invalid-qr", retryable: false, ambiguous: false });
  });

  it("uses existing notifications and read endpoints with tenant and capability headers", async () => {
    const fetchImpl = fetchResponse([notification()]);
    expect((await invoke({ action: "notifications", ticketId, queueToken }, fetchImpl)).body).toEqual({ ok: true, data: [notification()] });
    expect(String(fetchImpl.mock.calls[0][0]).endsWith(`/queue-tickets/${ticketId}/notifications`)).toBe(true);
    const readFetch = fetchResponse({ ...notification(), status: "READ", readAt: "2026-11-01T10:06:00+06:30" });
    const { body } = await invoke({ action: "read", ticketId, queueToken, notificationId: noticeId }, readFetch);
    expect(body.data.status).toBe("READ");
    expect(String(readFetch.mock.calls[0][0]).endsWith(`/queue-tickets/${ticketId}/notifications/${noticeId}/read`)).toBe(true);
    expect(readFetch.mock.calls[0][1]?.method).toBe("PATCH");
    expect(new Headers(readFetch.mock.calls[0][1]?.headers).get("X-Restaurant-Id")).toBe(a.restaurantId);
  });

  it("rejects a different ticket's status and notifications", async () => {
    const badStatus = await invoke({ action: "status", ticketId, queueToken }, fetchResponse({ ...status(), ticketId: tableId }));
    const badNotices = await invoke({ action: "notifications", ticketId, queueToken }, fetchResponse([{ ...notification(), queueTicketId: tableId }]));
    expect(badStatus.body.error).toBe("retry");
    expect(badNotices.body.error).toBe("retry");
    expect(JSON.stringify(badNotices.body)).not.toContain(notification().title);
  });

  it.each(["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"])("accepts the existing backend %s order status", async orderStatus => {
    const { body } = await invoke({ action: "status", ticketId, queueToken }, fetchResponse({ ...status(), orderStatus }));
    expect(body.data.orderStatus).toBe(orderStatus);
  });

  it("preserves the optional order reference in an existing queue notification", async () => {
    const { body } = await invoke({ action: "notifications", ticketId, queueToken }, fetchResponse([{ ...notification(), orderId: null }]));
    expect(body.data[0].orderId).toBeNull();
  });
});

describe("guest input and failure containment", () => {
  it.each([
    { ...checkout, restaurantId: b.restaurantId },
    { ...checkout, items: [] },
    { ...checkout, idempotencyKey: undefined },
    { ...checkout, idempotencyKey: "short" },
    { ...checkout, idempotencyKey: "header\r\ninjection" },
    { ...checkout, qrToken: "x".repeat(65) },
    { ...checkout, qrToken: " " },
    { ...checkout, items: [{ productId, quantity: 0 }] },
    { ...checkout, items: [{ productId: "other/tenant", quantity: 1 }] },
    { ...checkout, items: [{ productId, quantity: 1, totalAmount: 1 }] },
    { ...checkout, items: [{ productId, quantity: 1, specialInstruction: "x".repeat(501) }] },
    { ...checkout, items: [{ productId, quantity: 1, modifiers: [{ modifierOptionId: tableId, quantity: 11 }] }] },
    { action: "status", ticketId, queueToken: "secret\r\nInjected: true" },
    { action: "unknown", qrToken },
  ])("rejects malformed or authority-bearing input before upstream access", async input => {
    const fetchImpl = fetchResponse({});
    const { body } = await invoke(input, fetchImpl);
    expect(body.error).toBe("selection");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  const unsafeHeaders: Record<string, string>[] = [
    { origin: "https://attacker.test" },
    { origin: "null" },
    { origin: "http://garden.test" },
    { "content-type": "text/plain" },
  ];
  it.each(unsafeHeaders)("refuses cross-origin and non-JSON posts", async headers => {
    const fetchImpl = fetchResponse({});
    const { response } = await invoke(checkout, fetchImpl, "garden.test", headers);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses all proxy query strings without echoing accidentally supplied credentials", async () => {
    const fetchImpl = fetchResponse({});
    const { body } = await invoke(checkout, fetchImpl, "garden.test", {}, `?qrToken=${qrToken}`);
    expect(body.error).toBe("selection");
    expect(JSON.stringify(body)).not.toContain(qrToken);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps backend outages and malformed responses generic and does not write logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error(`https://private.test/?qrToken=${qrToken}`));
    const { body } = await invoke({ action: "validate", kind: "TABLE_QR", qrToken }, fetchImpl);
    expect(body).toEqual({ ok: false, error: "retry", retryable: true, ambiguous: false });
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("fails safely for invalid API configuration and expired validation requests", async () => {
    const req = request({ action: "validate", kind: "COMMON_QR", qrToken });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout with credentials")));
    }));
    const response = await handleGuestApi(req, undefined, { baseUrl, fetchImpl, timeoutMs: 5 });
    expect(await response.json()).toEqual({ ok: false, error: "retry", retryable: true, ambiguous: false });
    const invalid = await handleGuestApi(request(checkout), undefined, { baseUrl: "https://api.test/path?secret=1", fetchImpl });
    expect((await invalid.json()).error).toBe("configuration");
  });
});
