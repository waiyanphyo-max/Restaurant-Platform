import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateOrderResponse, MenuProductDto } from "@restaurant-platform/shared-types";
import { createGuestRequest, GuestOrderController, validateCartSelection, type GuestRequest, type QrKind } from "./guest-order";

const restaurantA = "11111111-1111-4111-8111-111111111111";
const restaurantB = "22222222-2222-4222-8222-222222222222";
const product: MenuProductDto = {
  id: "33333333-3333-4333-8333-333333333333", name: "Tea", description: null,
  price: null, imageUrl: null, available: true, trackStock: true, stockQuantity: 5,
  variants: [{ id: "44444444-4444-4444-8444-444444444444", name: "Large", price: 3000, imageUrl: null, available: true }],
  modifierGroups: [{ id: "55555555-5555-4555-8555-555555555555", name: "Milk", required: true, minSelections: 1, maxSelections: 1,
    options: [{ id: "66666666-6666-4666-8666-666666666666", name: "Oat", additionalPrice: 500, available: true }] }],
};
const selection = { variantId: product.variants[0].id, quantity: 2, specialInstruction: "Less sweet",
  modifiers: [{ modifierOptionId: product.modifierGroups[0].options[0].id, quantity: 2 }] };
function receipt(kind: QrKind): CreateOrderResponse {
  return { orderId: "77777777-7777-4777-8777-777777777777", orderNumber: "ORD-20261101-000001", orderType: kind === "TABLE_QR" ? "DINE_IN" : "TAKEAWAY",
    orderChannel: kind, status: "PENDING", currency: "MMK", subtotal: 8100, deliveryFee: 0, discountAmount: 0, totalAmount: 8100,
    queue: kind === "TABLE_QR" ? null : { ticketId: "88888888-8888-4888-8888-888888888888", queueNumber: 7, displayCode: "007", status: "WAITING", trackingToken: "private-queue-token" } };
}
function fixture(restaurantId: string, kind: QrKind) {
  const requests: Record<string, unknown>[] = [];
  const request = vi.fn(async (body: Record<string, unknown>) => {
    requests.push(structuredClone(body));
    if (body.action === "validate") return { ok: true, data: { restaurantId, kind, tableId: kind === "TABLE_QR" ? product.id : null, tableNumber: kind === "TABLE_QR" ? "A4" : null } };
    if (body.action === "checkout") return { ok: true, data: receipt(kind) };
    if (body.action === "status") return { ok: true, data: { ticketId: receipt(kind).queue?.ticketId, orderNumber: receipt(kind).orderNumber,
      queueNumber: 7, displayCode: "007", queueStatus: "READY", orderStatus: "READY", createdAt: "2026-11-01T10:00:00Z", readyAt: "2026-11-01T10:05:00Z", calledAt: null, completedAt: null } };
    return { ok: true, data: [] };
  });
  let index = 0;
  const controller = new GuestOrderController(restaurantId, request as GuestRequest, () => `idempotency-unique-${++index}`);
  return { controller, request, requests };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("guest ordering through two restaurants and QR modes", () => {
  it.each([restaurantA, restaurantB].flatMap(id => (["TABLE_QR", "COMMON_QR"] as const).map(kind => [id, kind] as const)))("configures and places %s %s with only backend totals", async (id, kind) => {
    const { controller, requests } = fixture(id, kind);
    await controller.start(kind, "private-qr-token");
    expect(controller.state.context?.restaurantId).toBe(id);
    expect(controller.add(product, selection)).toBe(true);
    await controller.checkout();
    expect(controller.state.phase).toBe("confirmed");
    expect(controller.state.receipt?.totalAmount).toBe(8100);
    expect(controller.state.receipt?.orderType).toBe(kind === "TABLE_QR" ? "DINE_IN" : "TAKEAWAY");
    const checkout = requests.find(r => r.action === "checkout");
    expect(checkout?.items).toEqual([{ productId: product.id, ...selection }]);
    expect(checkout).not.toHaveProperty("totalAmount");
    expect(JSON.stringify(controller.state)).not.toContain("private-qr-token");
    expect(JSON.stringify(controller.state)).not.toContain("private-queue-token");
    if (kind === "COMMON_QR") {
      expect(controller.state.tracking?.queueStatus).toBe("READY");
      expect(requests.find(r => r.action === "status")).toHaveProperty("queueToken", "private-queue-token");
    }
    await controller.checkout();
    expect(requests.filter(r => r.action === "checkout")).toHaveLength(1);
    controller.dispose();
  });

  it("refuses empty cart, invalid QR, cross tenant context and unavailable items", async () => {
    const { controller, request } = fixture(restaurantA, "TABLE_QR");
    await controller.start("TABLE_QR", null);
    expect(controller.state.phase).toBe("invalid");
    expect(controller.add(product, selection)).toBe(false);
    expect(request).not.toHaveBeenCalled();
    await controller.start("TABLE_QR", "qr");
    await controller.checkout();
    expect(request.mock.calls.filter(([r]) => r.action === "checkout")).toHaveLength(0);
    expect(controller.add({ ...product, available: false }, selection)).toBe(false);
    const cross = new GuestOrderController(restaurantB, request as GuestRequest);
    await cross.start("TABLE_QR", "qr");
    expect(cross.state.phase).toBe("error");
    expect(cross.state.context).toBeNull();
  });

  it("locks edits and simultaneous submit, then reuses the identical body/key after a lost response", async () => {
    const { controller, request } = fixture(restaurantA, "TABLE_QR");
    await controller.start("TABLE_QR", "qr");
    controller.add(product, selection);
    let rejectCheckout: (reason: Error) => void = () => {};
    request.mockImplementationOnce(() => new Promise((_, reject) => { rejectCheckout = reject; }));
    const first = controller.checkout();
    expect(controller.state.phase).toBe("submitting");
    controller.remove(controller.state.cart[0].id);
    controller.setQuantity(controller.state.cart[0].id, 1);
    expect(controller.add(product, selection)).toBe(false);
    await controller.checkout();
    const firstBody = structuredClone(request.mock.calls[1][0]);
    rejectCheckout(new Error("connection lost"));
    await first;
    expect(controller.state.phase).toBe("uncertain");
    expect(controller.state.cart[0].quantity).toBe(2);
    await controller.checkout();
    expect(request.mock.calls[2][0]).toEqual(firstBody);
    expect(controller.state.phase).toBe("confirmed");
  });

  it("uses a fresh key only after a definitive stock rejection", async () => {
    const { controller, request } = fixture(restaurantA, "TABLE_QR");
    await controller.start("TABLE_QR", "qr"); controller.add(product, selection);
    request.mockResolvedValueOnce({ ok: false, error: "selection", ambiguous: false, retryable: false } as never);
    await controller.checkout();
    expect(controller.state.phase).toBe("ready");
    controller.setQuantity(controller.state.cart[0].id, 1);
    await controller.checkout();
    expect(request.mock.calls[2][0].idempotencyKey).not.toBe(request.mock.calls[1][0].idempotencyKey);
  });

  it("keeps prior uncertainty and the original key through a later configuration failure", async () => {
    const { controller, request } = fixture(restaurantA, "TABLE_QR");
    await controller.start("TABLE_QR", "qr"); controller.add(product, selection);
    request.mockRejectedValueOnce(new Error("committed response lost")); await controller.checkout();
    const original = structuredClone(request.mock.calls[1][0]);
    request.mockResolvedValueOnce({ ok: false, error: "configuration", ambiguous: false, retryable: true } as never);
    await controller.checkout();
    expect(controller.state.phase).toBe("uncertain");
    await controller.checkout();
    expect(request.mock.calls[3][0]).toEqual(original);
    expect(controller.state.phase).toBe("confirmed");
  });

  it("recovers after reload with the original scan and key even when QR validation would now fail", async () => {
    const storage = new Map<string, string>();
    const store = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
    const { request } = fixture(restaurantA, "TABLE_QR");
    const controller = new GuestOrderController(restaurantA, request as GuestRequest, () => "idempotency-original-key", store);
    await controller.start("TABLE_QR", "original-private-credential"); controller.add(product, selection);
    request.mockRejectedValueOnce(new Error("lost")); await controller.checkout();
    expect([...storage.values()].join()).not.toContain("original-private-credential");
    controller.dispose();
    const resumed = new GuestOrderController(restaurantA, request as GuestRequest, undefined, store);
    const before = request.mock.calls.length;
    await resumed.start("TABLE_QR", "original-private-credential");
    expect(resumed.state.phase).toBe("uncertain");
    expect(request.mock.calls).toHaveLength(before); // Replay does not require current credential validity.
    await resumed.checkout();
    expect(request.mock.calls[before][0].idempotencyKey).toBe("idempotency-original-key");
    expect(resumed.state.phase).toBe("confirmed");
    expect(storage.size).toBe(0);
  });

  it("never replays past the backend idempotency retention window", async () => {
    vi.useFakeTimers();
    const { controller, request } = fixture(restaurantA, "TABLE_QR");
    await controller.start("TABLE_QR", "qr"); controller.add(product, selection);
    request.mockRejectedValueOnce(new Error("lost")); await controller.checkout();
    const count = request.mock.calls.length;
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
    await controller.checkout();
    expect(controller.state.error).toBe("expired");
    expect(request.mock.calls).toHaveLength(count);
  });

  it.each([null, {}, { id: "cart-line" }])("ignores corrupt cart recovery entries without publishing them: %s", async line => {
    const { request } = fixture(restaurantA, "TABLE_QR");
    const store = { getItem: () => JSON.stringify({ key: "idempotency-original-key", createdAt: Date.now(), kind: "TABLE_QR", tableId: product.id, tableNumber: "A4", items: [{}], cart: [line] }), setItem: vi.fn(), removeItem: vi.fn() };
    const controller = new GuestOrderController(restaurantA, request as GuestRequest, undefined, store);
    await controller.start("TABLE_QR", "qr");
    expect(controller.state.phase).toBe("ready");
    expect(controller.state.cart).toEqual([]);
  });

  it("preserves last known queue status after a network failure and recovers", async () => {
    const { controller, request } = fixture(restaurantA, "COMMON_QR");
    await controller.start("COMMON_QR", "qr"); controller.add(product, selection); await controller.checkout();
    request.mockRejectedValueOnce(new Error("offline")); await controller.refresh();
    expect(controller.state.trackingError).toBe(true);
    expect(controller.state.tracking?.queueStatus).toBe("READY");
    await controller.refresh(); expect(controller.state.trackingError).toBe(false);
  });

  it("creates audio only after an explicit gesture and alerts on READY/CALLED once", async () => {
    const oscillator = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
    const audio = { state: "running", resume: vi.fn(async () => {}), createOscillator: vi.fn(() => ({ ...oscillator, frequency: { value: 0 } })),
      createGain: () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 } }), close: vi.fn(async () => {}), destination: {}, currentTime: 0 };
    const Audio = vi.fn(function () { return audio; }); vi.stubGlobal("AudioContext", Audio);
    const { controller } = fixture(restaurantA, "COMMON_QR");
    await controller.start("COMMON_QR", "qr"); controller.add(product, selection);
    expect(Audio).not.toHaveBeenCalled();
    await controller.enableSound(); expect(Audio).toHaveBeenCalledOnce();
    await controller.checkout(); await controller.refresh();
    expect(audio.createOscillator).toHaveBeenCalledTimes(2); // gesture preview + one READY alert
    controller.dispose();
  });
});

describe("selection checks follow Spring constraints", () => {
  it("counts distinct options rather than units and sums stock across cart lines", () => {
    expect(validateCartSelection(product, selection)).toBe(true);
    expect(validateCartSelection(product, { ...selection, modifiers: [] })).toBe(false);
    expect(validateCartSelection(product, { ...selection, modifiers: [...selection.modifiers, ...selection.modifiers] })).toBe(false);
    expect(validateCartSelection(product, { ...selection, variantId: null })).toBe(false);
    expect(validateCartSelection(product, { ...selection, specialInstruction: "x".repeat(501) })).toBe(false);
    const { controller } = fixture(restaurantA, "TABLE_QR");
    return controller.start("TABLE_QR", "qr").then(() => {
      expect(controller.add(product, selection)).toBe(true);
      expect(controller.add(product, { ...selection, quantity: 4 })).toBe(false);
    });
  });
  it("sends credentials only in JSON, with no cookies, referrer, redirect or caching", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, data: {} }));
    await createGuestRequest("/r/garden/api/guest", fetchImpl)({ action: "validate", qrToken: "private" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("private"); expect(init.body).toContain("private");
    expect(init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error" });
  });
});
