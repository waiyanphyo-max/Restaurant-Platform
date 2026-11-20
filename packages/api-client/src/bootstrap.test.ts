import { describe, expect, it, vi } from "vitest";
import type { PlatformBootstrapSnapshot, PlatformBootstrapStepRequest, PlatformBootstrapStepResponse } from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiNetworkError, ApiProtocolError, MissingAccessTokenError, createPlatformAdminApiClient } from "./index.js";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const now = "2026-11-19T00:00:00Z";
const request: PlatformBootstrapStepRequest = { operationKey: "approved.category.1", kind: "CATEGORY", category: { name: "Approved dishes", active: true } };
const response: PlatformBootstrapStepResponse = { operationKey: request.operationKey, kind: request.kind,
  resourceId: categoryId, result: { id: categoryId }, actorId: b, completedAt: now };
const snapshot: PlatformBootstrapSnapshot = { restaurantId: a, currency: "MMK", steps: [response],
  settings: { restaurantId: a, currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 0, defaultDeliveryFee: 0,
    acceptsOrders: false, allowQrOrder: true, allowDelivery: false, allowTakeaway: true, defaultDeliveryDriverUserId: null },
  categories: [{ id: categoryId, name: "Approved dishes", active: true, displayOrder: 0 }],
  products: [{ id: productId, categoryId, name: "Synthetic meal", price: 2500, description: null, imageUrl: null,
    available: true, trackStock: false, stockQuantity: null, createdAt: now, updatedAt: now }],
  variants: [], modifierGroups: [], productModifierGroups: [], catalogComplete: false, mediaManifest: [],
  branding: { restaurantId: a, displayName: "Synthetic A", palette: null, revision: 0, logoUrl: null },
  owners: [{ userId: b, email: "owner-a@example.test", fullName: "Synthetic owner", invitationStatus: "INVITED",
    onboardingStatus: "UNKNOWN", onboardingCompletedAt: null }], ownerOnboardingConfirmed: false,
  photosStatus: "PENDING", nativeBuildStatus: "PENDING", handoffReady: false, handedOff: false, blockers: ["OWNER_SETUP_PENDING"] };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
const client = (fetchImpl: typeof fetch, token: string | null = "allowlisted-admin") => createPlatformAdminApiClient({
  baseUrl: "https://api.example.test", getAccessToken: () => token, fetchImpl,
});

describe("private initial restaurant bootstrap", () => {
  it("uses exact scoped routes, current bearer, safe request projection and no browser caches", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(snapshot)).mockResolvedValueOnce(json(response));
    const api = client(fetchImpl);
    await expect(api.getBootstrap(a)).resolves.toEqual(snapshot);
    await expect(api.bootstrapStep(a, { ...request, actorId: b, restaurantId: b } as PlatformBootstrapStepRequest)).resolves.toEqual(response);
    expect(fetchImpl.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      [`https://api.example.test/api/v1/platform/restaurants/${a}/bootstrap`, "GET"],
      [`https://api.example.test/api/v1/platform/restaurants/${a}/bootstrap/steps`, "POST"],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual(request);
    for (const [, init] of fetchImpl.mock.calls) {
      expect((init?.headers as Headers).get("authorization")).toBe("Bearer allowlisted-admin");
      expect(init).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error" });
    }
  });

  it.each([401, 403, 409, 502, 503])("preserves HTTP %s and never automatically replays a write", async status => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code: "BOOTSTRAP_DENIED" }, status));
    await expect(client(fetchImpl).bootstrapStep(a, request)).rejects.toMatchObject({ status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requires a current authenticated bearer before any setup mutation", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl, null).bootstrapStep(a, request)).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("projects only the supported ordering settings, excluding QR and driver secrets", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...response, operationKey: "ordering", kind: "ORDERING_SETTINGS", resourceId: null }));
    await client(fetchImpl).bootstrapStep(a, { operationKey: "ordering", kind: "ORDERING_SETTINGS",
      settings: { ...snapshot.settings, commonQrToken: "must-not-send" } } as PlatformBootstrapStepRequest);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string).settings).toEqual({
      currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 0, defaultDeliveryFee: 0,
      acceptsOrders: false, allowQrOrder: true, allowDelivery: false, allowTakeaway: true,
    });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])("rejects inexact/invalid catalog money %s before fetching", async price => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl).bootstrapStep(a, { operationKey: "meal", kind: "PRODUCT", currency: "MMK",
      product: { categoryId, name: "Synthetic meal", price, available: true, trackStock: false } })).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["", "../new-key", "a".repeat(101)])("rejects unsafe/missing operation key %s", async operationKey => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl).bootstrapStep(a, { ...request, operationKey })).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reconciles a lost response before a deliberate replay of the exact saved operation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(json(snapshot)).mockResolvedValueOnce(json(response));
    const api = client(fetchImpl);
    await expect(api.bootstrapStep(a, request)).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const recovered = await api.getBootstrap(a);
    expect(recovered.steps.find(step => step.operationKey === request.operationKey)?.resourceId).toBe(categoryId);
    await expect(api.bootstrapStep(a, request)).resolves.toEqual(response);
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(fetchImpl.mock.calls[2][1]?.body);
  });

  it.each(["../other", "", "not-a-uuid"])("rejects invalid tenant ID %s before fetch", async id => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl).getBootstrap(id)).rejects.toBeInstanceOf(ApiConfigurationError);
    await expect(client(fetchImpl).bootstrapStep(id, request)).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires a current authenticated session", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl, null).bootstrapStep(a, request)).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])("rejects non-exact whole price %s", async price => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl).bootstrapStep(a, { operationKey: "meal", kind: "PRODUCT", currency: "MMK",
      product: { categoryId, name: "Meal", price, trackStock: false, available: true } })).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("projects product fields without an image URL or actor claim", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...response, operationKey: "meal", kind: "PRODUCT", resourceId: productId }));
    await client(fetchImpl).bootstrapStep(a, { operationKey: "meal", kind: "PRODUCT", currency: "MMK",
      product: { categoryId, name: "Meal", price: 2500, trackStock: false, available: true,
        imageUrl: "https://unreviewed.example.test/production.jpg" } } as PlatformBootstrapStepRequest);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({ operationKey: "meal", kind: "PRODUCT", currency: "MMK",
      product: { categoryId, name: "Meal", price: 2500, trackStock: false, available: true } });
  });

  it.each([
    { restaurantId: b }, { branding: { ...snapshot.branding, restaurantId: b } },
    { products: [{ ...snapshot.products[0], categoryId: b }] },
    { variants: [{ id: b, productId: b }] },
    { productModifierGroups: [{ productId, modifierGroupId: b }] },
    { photosStatus: "VERIFIED" }, { nativeBuildStatus: "PUBLISHED" }, { ownerOnboardingConfirmed: "yes" },
  ])("rejects wrong-scope/incompatible recovery snapshot %j", async patch => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...snapshot, ...patch }));
    await expect(client(fetchImpl).getBootstrap(a)).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it.each([{ operationKey: "other" }, { kind: "HANDOFF" }, { actorId: "invalid" }, { resourceId: "invalid" }, { resourceId: null }])(
    "rejects a mismatched operation receipt %j", async patch => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...response, ...patch }));
      await expect(client(fetchImpl).bootstrapStep(a, request)).rejects.toBeInstanceOf(ApiProtocolError);
    });

  const entry = { originalFilename: "approved-original.jpg", restaurantId: a, productId, variantId: null,
    intendedAssociation: "PRODUCT_IMAGE" as const, reviewStatus: "APPROVED" as const,
    originalContentHash: "a".repeat(64), uploadStatus: "PENDING" as const };
  it("sends a reviewed exact-ID manifest with upload still pending", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...response, operationKey: "media", kind: "MEDIA_MANIFEST", resourceId: null }));
    await client(fetchImpl).bootstrapStep(a, { operationKey: "media", kind: "MEDIA_MANIFEST", mediaManifest: [entry] });
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string).mediaManifest).toEqual([entry]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string).expectedMediaOperationKey).toBeNull();
  });

  it("preserves the reviewed manifest revision and never retries or rebases a stale replacement", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code: "BOOTSTRAP_MEDIA_MANIFEST_STALE" }, 409));
    const request: PlatformBootstrapStepRequest = { operationKey: "media-revision-2", kind: "MEDIA_MANIFEST",
      expectedMediaOperationKey: "media-revision-1", mediaManifest: [entry] };
    await expect(client(fetchImpl).bootstrapStep(a, request)).rejects.toMatchObject({ status: 409, code: "BOOTSTRAP_MEDIA_MANIFEST_STALE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual(request);
  });

  it.each(["", "../another", "x".repeat(101)])("rejects malformed manifest revision key %s before dispatch", async expectedMediaOperationKey => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl).bootstrapStep(a, { operationKey: "media", kind: "MEDIA_MANIFEST",
      expectedMediaOperationKey, mediaManifest: [entry] })).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([{ restaurantId: b }, { originalFilename: "../file.jpg" }, { originalContentHash: "not-a-hash" },
    { productId: null }, { uploadStatus: "UPLOADED" }, { intendedAssociation: "VARIANT_IMAGE" }])(
    "rejects an invalid/unauthorized manifest %j before fetch", async patch => {
      const fetchImpl = vi.fn<typeof fetch>();
      await expect(client(fetchImpl).bootstrapStep(a, { operationKey: "media", kind: "MEDIA_MANIFEST",
        mediaManifest: [{ ...entry, ...patch } as typeof entry] })).rejects.toBeInstanceOf(ApiConfigurationError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

  it("keeps A/B recovery snapshots independent", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async url => json(String(url).includes(b) ?
      { ...snapshot, restaurantId: b, settings: { ...snapshot.settings, restaurantId: b }, steps: [], categories: [], products: [],
        owners: [{ ...snapshot.owners[0], userId: a, email: "owner-b@example.test" }],
        branding: { ...snapshot.branding, restaurantId: b, displayName: "Blue fixture", palette:
        { primaryColor: "#124981", secondaryColor: "#DDEEFF", backgroundColor: "#FFFFFF" }, revision: 1 } } : snapshot));
    const api = client(fetchImpl);
    const first = await api.getBootstrap(a), second = await api.getBootstrap(b);
    expect(first.branding.palette).toBeNull();
    expect(second.branding.palette?.primaryColor).toBe("#124981");
    expect(first.restaurantId).toBe(a);
  });
});
