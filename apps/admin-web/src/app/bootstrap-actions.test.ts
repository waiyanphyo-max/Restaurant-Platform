import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiTimeoutError } from "@restaurant-platform/api-client";
import { applyBootstrapStep, initializeRestaurantBranding, provisionRestaurant, reconcileProvisioning, refreshBootstrap } from "./(admin)/actions";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), step: vi.fn(), branding: vi.fn(), get: vi.fn(), list: vi.fn(), detail: vi.fn(), provision: vi.fn() }));
vi.mock("@/lib/admin-context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const id = "11111111-1111-4111-8111-111111111111";
const palette = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const request = { operationKey: "cat-approved-1", kind: "CATEGORY" as const, category: { name: "Dishes", active: true } };
beforeEach(() => { vi.resetAllMocks(); mocks.requireAdmin.mockResolvedValue({ api: { bootstrapStep: mocks.step, initializeBranding: mocks.branding, getBootstrap: mocks.get, listRestaurants: mocks.list, getRestaurant: mocks.detail, provisionRestaurant: mocks.provision } }); });

describe("protected setup server actions", () => {
  it("checks admin access for reads, writes and reconciliation before API calls", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("DENIED"));
    for (const action of [() => refreshBootstrap(id), () => applyBootstrapStep(id, request), () => initializeRestaurantBranding(id, palette), () => reconcileProvisioning("restaurant-a")]) await expect(action()).rejects.toThrow("DENIED");
    expect(mocks.step).not.toHaveBeenCalled(); expect(mocks.branding).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("reuses revision zero canonical branding and exact keyed catalog contracts without retry", async () => {
    mocks.branding.mockResolvedValue({ restaurantId: id, palette, revision: 1 });
    mocks.step.mockResolvedValue({ operationKey: request.operationKey, kind: request.kind, result: {}, resourceId: id });
    expect(await initializeRestaurantBranding(id, palette)).toMatchObject({ ok: true });
    expect(mocks.branding).toHaveBeenCalledExactlyOnceWith(id, { expectedRevision: 0, palette });
    expect(await applyBootstrapStep(id, request)).toMatchObject({ ok: true });
    expect(mocks.step).toHaveBeenCalledExactlyOnceWith(id, request);
  });
  it("returns uncertain failures for timeout/conflict without pretending setup completed", async () => {
    for (const error of [new ApiTimeoutError(), new ApiHttpError(409, "BOOTSTRAP_OPERATION_KEY_REUSED")]) {
      mocks.step.mockRejectedValueOnce(error);
      expect(await applyBootstrapStep(id, request)).toMatchObject({ ok: false, uncertain: true });
    }
    expect(mocks.step).toHaveBeenCalledTimes(2);
  });
  it("resolves only exact server slug matches and reads returned IDs; never sends an invitation", async () => {
    mocks.list.mockResolvedValueOnce({ content: [{ id, slug: "restaurant-a-copy" }], last: false })
      .mockResolvedValueOnce({ content: [{ id, slug: "restaurant-a" }], last: true });
    mocks.detail.mockResolvedValue({ restaurant: { id, slug: "restaurant-a" } });
    expect(await reconcileProvisioning("restaurant-a")).toEqual({ ok: true, data: { id } });
    expect(mocks.detail).toHaveBeenCalledExactlyOnceWith(id); expect(mocks.provision).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
  it("does not treat a partial registry search or provider failure as confirmed absence", async () => {
    mocks.list.mockRejectedValue(new ApiTimeoutError());
    expect(await reconcileProvisioning("restaurant-a")).toMatchObject({ ok: false, uncertain: true });
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("marks only local validation rejection safe for repair before another dispatch", async () => {
    const provision = { ownerEmail: "owner@example.test", restaurant: { name: "A", slug: "a", city: "Yangon", township: "Bahan" } };
    mocks.provision.mockRejectedValueOnce(new ApiHttpError(400, "INVALID_REQUEST"));
    expect(await provisionRestaurant(provision)).toMatchObject({ ok: false, safeToEdit: true });
    mocks.provision.mockRejectedValueOnce(new ApiHttpError(502, "PLATFORM_OWNER_INVITATION_PROVIDER_ERROR"));
    expect(await provisionRestaurant(provision)).toMatchObject({ ok: false, safeToEdit: false, uncertain: true });
  });
  it.each(["PLATFORM_PUBLIC_ORIGIN_NOT_CONFIGURED", "PLATFORM_OWNER_INVITATION_NOT_CONFIGURED"])("allows repair when %s prevented an external invitation", async code => {
    const provision = { ownerEmail: "owner@example.test", restaurant: { name: "A", slug: "a", city: "Yangon", township: "Bahan" } };
    mocks.provision.mockRejectedValueOnce(new ApiHttpError(503, code));
    expect(await provisionRestaurant(provision)).toEqual({ ok: false, message: "Configuration prevented the request; no invitation was sent. Correct configuration and review again.", fields: {}, safeToEdit: true });
    expect(mocks.provision).toHaveBeenCalledOnce();
  });
  it("keeps an unknown 503 ambiguous rather than clearing a possibly sent invitation", async () => {
    mocks.provision.mockRejectedValueOnce(new ApiHttpError(503, "UNKNOWN_PROVIDER_OUTCOME"));
    expect(await provisionRestaurant({ ownerEmail: "owner@example.test", restaurant: { name: "A", slug: "a", city: "Yangon", township: "Bahan" } })).toMatchObject({ ok: false, safeToEdit: false, uncertain: true });
  });
  it("requires rebuilding a reviewed manifest after an explicit stale conflict", async () => {
    mocks.step.mockRejectedValueOnce(new ApiHttpError(409, "BOOTSTRAP_MEDIA_MANIFEST_STALE"));
    expect(await applyBootstrapStep(id, { operationKey: "media-1", kind: "MEDIA_MANIFEST", expectedMediaOperationKey: null, mediaManifest: [] })).toMatchObject({ ok: false, uncertain: true, rebuildRequired: true, message: expect.stringContaining("cancel this old review") });
    expect(mocks.step).toHaveBeenCalledOnce();
  });
});
