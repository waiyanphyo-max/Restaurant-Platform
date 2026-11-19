import { describe, expect, it, vi } from "vitest";
import { ApiCancelledError, ApiHttpError, ApiNetworkError, ApiTimeoutError, TenantAccessError } from "@restaurant-platform/api-client";
import type { RestaurantBrandingResponse } from "@restaurant-platform/shared-types";
import { createRuntimeBrandingController, type RuntimeBrandingScope } from "./runtime";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const palette = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const first: RestaurantBrandingResponse = { restaurantId, displayName: "Restaurant A", logoUrl: null, palette, revision: 1 };
const second: RestaurantBrandingResponse = { ...first, palette: { ...palette, primaryColor: "#082F49" }, revision: 2 };
const scope: RuntimeBrandingScope = { key: "tenant-a:staging:api-a:owner-a:OWNER", restaurantId, role: "OWNER" };
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const unauthorized = vi.fn();
  const controller = createRuntimeBrandingController(unauthorized);
  const api = { getBranding: vi.fn().mockResolvedValue(first), updateBranding: vi.fn().mockResolvedValue(second) };
  controller.setAccess(scope, true, api);
  return { controller, api, unauthorized };
}

describe("Operations runtime branding lifecycle", () => {
  it("loads the fixed restaurant once and coalesces concurrent refreshes with bounded request options", async () => {
    const { controller, api } = fixture();
    await Promise.all([controller.refresh(), controller.refresh(), controller.refresh()]);
    expect(api.getBranding).toHaveBeenCalledOnce();
    expect(api.getBranding.mock.calls[0][0]).toMatchObject({ timeoutMs: 10_000, signal: expect.any(AbortSignal) });
    expect(controller.getState()).toMatchObject({ branding: first, loading: false, refreshing: false, error: null });
  });

  it("keeps a missing palette at revision zero truthful without creating or saving fallback colors", async () => {
    const controller = createRuntimeBrandingController();
    const api = { getBranding: vi.fn().mockResolvedValue({ ...first, palette: null, revision: 0 }), updateBranding: vi.fn() };
    controller.setAccess(scope, true, api);
    await controller.refresh();
    expect(controller.getState().branding).toMatchObject({ palette: null, revision: 0 });
    expect(api.updateBranding).not.toHaveBeenCalled();
  });

  it.each([new ApiNetworkError(), new ApiTimeoutError()])("retains the last validated palette on offline/timeout refresh with explicit retry", async failure => {
    const { controller, api } = fixture();
    await controller.refresh();
    api.getBranding.mockRejectedValueOnce(failure);
    expect(await controller.refresh()).toBe(false);
    expect(controller.getState()).toMatchObject({ branding: first, error: "offline", refreshing: false });
    api.getBranding.mockResolvedValue(second);
    expect(await controller.refresh()).toBe(true);
    expect(controller.getState().branding).toEqual(second);
    expect(api.getBranding).toHaveBeenCalledTimes(3);
  });

  it.each([
    { ...second, restaurantId: "22222222-2222-4222-8222-222222222222" },
    { ...second, palette: null },
    { ...second, palette: { ...palette, primaryColor: "#bad" } },
    { ...first, revision: 0 }
  ])("rejects a wrong UUID, corrupt runtime palette or older revision without replacing the last good theme", async invalid => {
    const { controller, api } = fixture();
    await controller.refresh();
    api.getBranding.mockResolvedValue(invalid);
    expect(await controller.refresh()).toBe(false);
    expect(controller.getState()).toMatchObject({ branding: first, error: "error" });
  });

  it.each(["tenant-b:staging:api-a:owner-a:OWNER", "tenant-a:production:api-a:owner-a:OWNER", "tenant-a:staging:api-b:owner-a:OWNER", "tenant-a:staging:api-a:owner-b:OWNER", "tenant-a:staging:api-a:owner-a:MANAGER"])("isolates data immediately when the scope changes to %s", async key => {
    const { controller, api } = fixture();
    await controller.refresh();
    const next = pending<RestaurantBrandingResponse>();
    const nextApi = { ...api, getBranding: vi.fn(() => next.promise) };
    controller.setAccess({ ...scope, key }, true, nextApi);
    expect(controller.getState()).toMatchObject({ scopeKey: key, branding: null, loading: true });
    next.resolve(second);
    await controller.refresh(key);
    expect(controller.getState().branding).toEqual(second);
  });

  it("aborts pending reads and discards them after sign-out, including a same-account sign-in", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    const old = pending<RestaurantBrandingResponse>();
    api.getBranding.mockImplementationOnce(() => old.promise);
    const reading = controller.refresh();
    await tick();
    const signal = api.getBranding.mock.calls[1][0].signal as AbortSignal;
    controller.setAccess(null, false, null);
    expect(signal.aborted).toBe(true);
    expect(controller.getState().branding).toBeNull();
    controller.setAccess(scope, true, api);
    await controller.refresh();
    old.resolve(second);
    expect(await reading).toBe(false);
    expect(controller.getState().branding).toEqual(first);
  });

  it("refreshes on auth's foreground revalidation and bounds rapid active transitions", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    controller.setAccess(scope, false, api);
    expect(controller.getState().branding).toEqual(first);
    const request = pending<RestaurantBrandingResponse>();
    api.getBranding.mockImplementationOnce(() => request.promise);
    controller.setAccess(scope, true, api);
    controller.setAccess(scope, true, api);
    controller.setAccess(scope, true, api);
    await tick();
    expect(api.getBranding).toHaveBeenCalledTimes(2);
    request.resolve(second);
    expect(await controller.refresh()).toBe(true);
    expect(controller.getState().branding).toEqual(second);
  });

  it.each([401, 403])("handles refresh HTTP %s without a successful state or automatic request loop", async status => {
    const { controller, api, unauthorized } = fixture();
    await controller.refresh();
    api.getBranding.mockRejectedValueOnce(new ApiHttpError(status, "DENIED"));
    expect(await controller.refresh()).toBe(false);
    expect(controller.getState()).toMatchObject({ branding: first, error: "denied" });
    expect(api.getBranding).toHaveBeenCalledTimes(2);
    expect(unauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it("disposes pending work without publishing any late response", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    const request = pending<RestaurantBrandingResponse>();
    api.getBranding.mockImplementationOnce(() => request.promise);
    const listener = vi.fn();
    controller.subscribe(listener);
    const loading = controller.refresh();
    await tick();
    controller.dispose();
    request.resolve(second);
    expect(await loading).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    expect(controller.getState().branding).toEqual(first);
  });
});

describe("scoped palette writes", () => {
  it.each(["OWNER", "MANAGER"] as const)("saves as %s with the proposed revision, applies immediately and refreshes the server", async role => {
    const { controller, api } = fixture();
    controller.setAccess({ ...scope, role }, true, api);
    await controller.refresh();
    const syncing = pending<RestaurantBrandingResponse>();
    api.getBranding.mockImplementationOnce(() => syncing.promise);
    const request = { expectedRevision: 1, palette: second.palette! };
    const saving = controller.save(request);
    await tick();
    expect(api.updateBranding).toHaveBeenCalledExactlyOnceWith(request, expect.objectContaining({ timeoutMs: 15_000, signal: expect.any(AbortSignal) }));
    expect(controller.getState()).toMatchObject({ branding: second, refreshing: true });
    syncing.resolve(second);
    expect(await saving).toEqual(second);
    expect(api.getBranding).toHaveBeenCalledTimes(2);
  });

  it.each(["STAFF", "DELIVERY_DRIVER"] as const)("denies palette writes from %s", async role => {
    const { controller, api } = fixture();
    controller.setAccess({ ...scope, role }, true, api);
    await expect(controller.save({ expectedRevision: 1, palette })).rejects.toBeInstanceOf(TenantAccessError);
    expect(api.updateBranding).not.toHaveBeenCalled();
  });

  it("prevents duplicate writes from rapid taps and aborts a read started before the save", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    const oldRead = pending<RestaurantBrandingResponse>();
    const write = pending<RestaurantBrandingResponse>();
    api.getBranding.mockImplementationOnce(() => oldRead.promise).mockResolvedValue(second);
    const previousRead = controller.refresh();
    await tick();
    const signal = api.getBranding.mock.calls[1][0].signal as AbortSignal;
    api.updateBranding.mockImplementationOnce(() => write.promise);
    const firstSave = controller.save({ expectedRevision: 1, palette });
    await expect(controller.save({ expectedRevision: 1, palette })).rejects.toBeInstanceOf(ApiCancelledError);
    write.resolve(second);
    await firstSave;
    expect(signal.aborted).toBe(true);
    oldRead.resolve(first);
    expect(await previousRead).toBe(false);
    expect(api.updateBranding).toHaveBeenCalledOnce();
    expect(controller.getState().branding).toEqual(second);
  });

  it("fetches latest after a stale conflict without retrying or silently overwriting", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    const conflict = new ApiHttpError(409, "RESTAURANT_BRANDING_STALE");
    api.updateBranding.mockRejectedValueOnce(conflict);
    api.getBranding.mockResolvedValue(second);
    await expect(controller.save({ expectedRevision: 1, palette })).rejects.toBe(conflict);
    expect(controller.getState().branding).toEqual(second);
    expect(api.updateBranding).toHaveBeenCalledOnce();
    expect(api.updateBranding.mock.calls[0][0].expectedRevision).toBe(1);
  });

  it.each([new ApiNetworkError(), new ApiTimeoutError(), new ApiHttpError(500, "SERVER_ERROR")])("never retries an uncertain or failed write and keeps the persisted theme", async failure => {
    const { controller, api } = fixture();
    await controller.refresh();
    api.updateBranding.mockRejectedValueOnce(failure);
    await expect(controller.save({ expectedRevision: 1, palette })).rejects.toBe(failure);
    expect(controller.getState().branding).toEqual(first);
    expect(api.updateBranding).toHaveBeenCalledOnce();
    expect(api.getBranding).toHaveBeenCalledOnce();
  });

  it("retains a confirmed successful save if the synchronization read fails", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    api.getBranding.mockRejectedValueOnce(new ApiNetworkError());
    expect(await controller.save({ expectedRevision: 1, palette })).toEqual(second);
    expect(controller.getState()).toMatchObject({ branding: second, error: "offline" });
  });

  it.each([{ ...first }, { ...first, palette: null, revision: 0 }])("does not claim success from a malformed or non-advancing write response", async invalid => {
    const { controller, api } = fixture();
    await controller.refresh();
    api.updateBranding.mockResolvedValueOnce(invalid);
    await expect(controller.save({ expectedRevision: 1, palette })).rejects.toMatchObject({ name: "ApiProtocolError" });
    expect(controller.getState()).toMatchObject({ branding: first, error: "error" });
  });

  it("never rolls a concurrently refreshed newer palette back to a delayed write response", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    const write = pending<RestaurantBrandingResponse>();
    api.updateBranding.mockImplementationOnce(() => write.promise);
    const saving = controller.save({ expectedRevision: 1, palette });
    const newer = { ...second, revision: 3 };
    api.getBranding.mockResolvedValueOnce(newer);
    await controller.refresh();
    write.resolve(second);
    await expect(saving).rejects.toMatchObject({ name: "ApiProtocolError" });
    expect(controller.getState().branding).toEqual(newer);
  });

  it.each([401, 403])("preserves failure and session behavior for a write HTTP %s", async status => {
    const { controller, api, unauthorized } = fixture();
    await controller.refresh();
    const failure = new ApiHttpError(status, "DENIED");
    api.updateBranding.mockRejectedValueOnce(failure);
    await expect(controller.save({ expectedRevision: 1, palette })).rejects.toBe(failure);
    expect(controller.getState()).toMatchObject({ branding: first, error: "denied" });
    expect(unauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it.each(["signed-out", "background", "role", "environment", "unmount"])("discards a pending write after %s, even when a fetch ignores abort", async reason => {
    const { controller, api } = fixture();
    await controller.refresh();
    const request = pending<RestaurantBrandingResponse>();
    api.updateBranding.mockImplementationOnce(() => request.promise);
    const saving = controller.save({ expectedRevision: 1, palette });
    const signal = api.updateBranding.mock.calls[0][1].signal as AbortSignal;
    if (reason === "signed-out") controller.setAccess(null, false, null);
    if (reason === "background") controller.setAccess(scope, false, api);
    if (reason === "role") controller.setAccess({ ...scope, key: `${scope.key}:staff`, role: "STAFF" }, true, api);
    if (reason === "environment") controller.setAccess({ ...scope, key: `${scope.key}:production` }, true, api);
    if (reason === "unmount") controller.dispose();
    if (reason === "background" || reason === "signed-out") controller.setAccess(scope, true, api);
    expect(signal.aborted).toBe(true);
    request.resolve(second);
    await expect(saving).rejects.toBeInstanceOf(ApiCancelledError);
    await tick();
    expect(controller.getState().branding).not.toEqual(second);
  });
});
