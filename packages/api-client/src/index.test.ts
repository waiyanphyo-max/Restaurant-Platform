import { describe, expect, it, vi } from "vitest";
import type { CustomerAddressResponse, PlatformOverviewResponse } from "@restaurant-platform/shared-types";
import {
  ApiCancelledError, ApiConfigurationError, ApiHttpError, ApiNetworkError,
  ApiProtocolError, ApiTimeoutError, MissingAccessTokenError, TenantAccessError,
  assertRestaurantContext, createCustomerApiClient, createPlatformAdminApiClient,
  createPublicRestaurantApiClient, createRestaurantMemberApiClient
} from "./index.js";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const baseUrl = "https://api.example.test";
const payload = { qrToken: "opaque-qr-credential", items: [] };
const json = (body: unknown = {}, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
});
type Call = [URL, RequestInit];

describe("public and authenticated boundaries", () => {
  it("never consults a session or sends cookies/bearer credentials for public QR", async () => {
    const fetchImpl = vi.fn(async () => json());
    const getAccessToken = vi.fn(() => "private-session");
    const options = { baseUrl, restaurantId, fetchImpl: fetchImpl as typeof fetch, getAccessToken };
    await createPublicRestaurantApiClient(options).createCommonQrOrder(payload, "retry-key");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as Call;
    expect(url.pathname).toBe(`/api/v1/public/restaurants/${restaurantId}/orders/common-qr`);
    expect(url.href).not.toContain(payload.qrToken);
    expect((init.headers as Headers).get("authorization")).toBeNull();
    expect((init.headers as Headers).get("idempotency-key")).toBe("retry-key");
    expect(init).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("keeps queue credentials in headers", async () => {
    const fetchImpl = vi.fn(async () => json());
    await createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl: fetchImpl as typeof fetch })
      .getQueueStatus(otherId, "queue-secret");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as Call;
    expect(url.href).not.toContain("queue-secret");
    expect((init.headers as Headers).get("x-queue-token")).toBe("queue-secret");
    expect((init.headers as Headers).has("authorization")).toBe(false);
  });

  it("obtains the current token for every authenticated request", async () => {
    const fetchImpl = vi.fn(async () => json());
    const getAccessToken = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("refreshed");
    const client = createPlatformAdminApiClient({ baseUrl, getAccessToken, fetchImpl: fetchImpl as typeof fetch });
    await client.getOverview(); await client.getOverview();
    expect(fetchImpl.mock.calls.map(call => ((call as unknown as Call)[1].headers as Headers).get("authorization")))
      .toEqual(["Bearer first", "Bearer refreshed"]);
  });

  it("fails before fetch when no token exists or the provider is missing", async () => {
    const fetchImpl = vi.fn(async () => json());
    await expect(createPlatformAdminApiClient({ baseUrl, getAccessToken: () => null, fetchImpl: fetchImpl as typeof fetch })
      .getOverview()).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(() => createPlatformAdminApiClient({ baseUrl } as never)).toThrow(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([401, 403])("preserves HTTP %s and never retries or refreshes on denial", async status => {
    const fetchImpl = vi.fn(async () => json({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      message: "Access denied", errors: [] }, status));
    const getAccessToken = vi.fn(() => "current-token");
    const client = createPlatformAdminApiClient({ baseUrl, getAccessToken, fetchImpl: fetchImpl as typeof fetch });
    await expect(client.getOverview()).rejects.toMatchObject({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(getAccessToken).toHaveBeenCalledTimes(1);
  });
});

describe("origin and tenant validation", () => {
  it.each(["http://api.example.test", "https://user:pass@api.example.test", "https://api.example.test/path",
    "https://api.example.test?token=x", "https://api.example.test#x", " https://api.example.test", "file:///tmp"])("rejects an invalid API origin %s", value => {
    expect(() => createPublicRestaurantApiClient({ baseUrl: value, restaurantId })).toThrow(ApiConfigurationError);
  });

  it("allows explicit local development origins and rejects path IDs", () => {
    expect(() => createPublicRestaurantApiClient({ baseUrl: "http://10.0.2.2:8080", restaurantId })).not.toThrow();
    expect(() => createPublicRestaurantApiClient({ baseUrl, restaurantId: "../other" })).toThrow();
    expect(() => assertRestaurantContext(restaurantId, otherId)).toThrow();
    expect(() => assertRestaurantContext(restaurantId, restaurantId.toUpperCase())).not.toThrow();
  });

  it("returns only the configured active membership and denies another tenant", async () => {
    const fetchImpl = vi.fn(async () => json([{ restaurantId: otherId, active: true, role: "OWNER" }]));
    const client = createRestaurantMemberApiClient({ baseUrl, restaurantId, getAccessToken: () => "token", fetchImpl: fetchImpl as typeof fetch });
    await expect(client.getConfiguredMembership()).rejects.toBeInstanceOf(TenantAccessError);
    fetchImpl.mockImplementation(async () => json([{ restaurantId, active: false, role: "OWNER" }]));
    await expect(client.getConfiguredMembership()).rejects.toBeInstanceOf(TenantAccessError);
    fetchImpl.mockImplementation(async () => json([{ restaurantId: otherId, active: true }, { restaurantId, active: true, role: "STAFF" }]));
    await expect(client.getConfiguredMembership()).resolves.toMatchObject({ restaurantId, role: "STAFF" });
  });

  it("locks customer delivery requests to the configured restaurant", async () => {
    const fetchImpl = vi.fn(async () => json([]));
    const client = createCustomerApiClient({ baseUrl, restaurantId, getAccessToken: () => "token", fetchImpl: fetchImpl as typeof fetch });
    await client.getDeliveryZones();
    expect((fetchImpl.mock.calls[0] as unknown as Call)[0].pathname)
      .toBe(`/api/v1/customer/restaurants/${restaurantId}/delivery-zones`);
    expect(client).not.toHaveProperty("listAllCustomerOrders");
  });
});

describe("errors, timeouts, cancellation and retries", () => {
  it("retries a transient GET once", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("network detail"))
      .mockResolvedValueOnce(json({ restaurantId, categories: [] }));
    await createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl }).getPublicMenu();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry earlier than a long server Retry-After", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", {
      status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" }
    }));
    const client = createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl: fetchImpl as typeof fetch });
    await expect(client.getPublicMenu()).rejects.toMatchObject({ status: 429, retryAfterMs: 60000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honors the HTTP-date form of Retry-After", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", {
      status: 503, headers: { "Content-Type": "application/json", "Retry-After": new Date(Date.now() + 60000).toUTCString() }
    }));
    await expect(createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl: fetchImpl as typeof fetch })
      .getPublicMenu()).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unsafe write, but retries QR with the same explicit idempotency key", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("opaque credential must not leak"); });
    const client = createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl: fetchImpl as typeof fetch });
    await expect(client.createTableQrOrder(payload)).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockClear();
    await expect(client.createTableQrOrder(payload, "same-key")).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      const init = (call as unknown as Call)[1];
      expect((init.headers as Headers).get("idempotency-key")).toBe("same-key");
      expect(JSON.parse(init.body as string)).toEqual(payload);
    }
  });

  it("returns typed timeouts and cancellation without retrying writes", async () => {
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const client = createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl: fetchImpl as typeof fetch });
    await expect(client.createCommonQrOrder(payload, undefined, { timeoutMs: 5 })).rejects.toBeInstanceOf(ApiTimeoutError);
    const controller = new AbortController();
    const pending = client.createCommonQrOrder(payload, undefined, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ApiCancelledError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps validation errors typed and rejects malformed success JSON", async () => {
    const fetchImpl = vi.fn(async () => json({ code: "VALIDATION_FAILED", errors: [{ field: "name", message: "Required" }] }, 400));
    const client = createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl: fetchImpl as typeof fetch });
    await expect(client.createCommonQrOrder(payload)).rejects.toMatchObject({
      status: 400, code: "VALIDATION_FAILED", fieldErrors: [{ field: "name", message: "Required" }]
    } satisfies Partial<ApiHttpError>);
    fetchImpl.mockImplementation(async () => new Response("not json", { status: 200 }));
    await expect(client.getPublicMenu()).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("handles Spring 204 deletes without parsing JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(createCustomerApiClient({ baseUrl, restaurantId, getAccessToken: () => "token", fetchImpl: fetchImpl as typeof fetch })
      .deleteAddress(otherId)).resolves.toBeUndefined();
  });

  it("rejects redirected responses and wrong-tenant payloads", async () => {
    const redirected = json();
    Object.defineProperty(redirected, "redirected", { value: true });
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirected).mockResolvedValueOnce(json({ restaurantId: otherId }));
    const client = createPublicRestaurantApiClient({ baseUrl, restaurantId, fetchImpl });
    await expect(client.getPublicMenu()).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(client.getPublicMenu()).rejects.toBeInstanceOf(ApiProtocolError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("audited Java wire DTOs", () => {
  it("preserves platform count fields and the Jackson isDefault address field", async () => {
    const overview = { totalRestaurants: 2, activeRestaurants: 1, inactiveRestaurants: 1, totalOrders: 3,
      totalRestaurantMembers: 4 } satisfies PlatformOverviewResponse;
    const address = { id: otherId, label: "Home", recipientName: null, houseNo: null, street: null, ward: null,
      township: "Township", city: "City", latitude: null, longitude: null, deliveryNote: null, isDefault: true,
      createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z" } satisfies CustomerAddressResponse;
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(overview)).mockResolvedValueOnce(json([address]));
    await expect(createPlatformAdminApiClient({ baseUrl, getAccessToken: () => "token", fetchImpl }).getOverview()).resolves.toEqual(overview);
    const result = await createCustomerApiClient({ baseUrl, restaurantId, getAccessToken: () => "token", fetchImpl }).listAddresses();
    expect(result[0].isDefault).toBe(true); expect(result[0].latitude).toBeNull();
  });
});
