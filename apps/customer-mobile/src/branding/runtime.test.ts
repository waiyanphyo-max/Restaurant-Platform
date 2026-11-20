import { describe, expect, it, vi } from "vitest";
import { ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { RestaurantBrandingResponse } from "@restaurant-platform/shared-types";
import { createCustomerBrandingController, type CustomerBrandingScope } from "./runtime";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const palette = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const brand: RestaurantBrandingResponse = { restaurantId: a, displayName: "Runtime A", logoUrl: null, palette, revision: 1 };
const scope: CustomerBrandingScope = { key: `${a}:staging:https://api-a.example.test:signed_out`, restaurantId: a };
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("Customer read-only runtime branding", () => {
  it("loads through the bound public port with a bounded timeout and no polling", async () => {
    const api = { getBranding: vi.fn().mockResolvedValue(brand) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api);
    expect(controller.getState()).toMatchObject({ branding: null, loading: true });
    await tick();
    expect(controller.getState()).toMatchObject({ branding: brand, loading: false, error: null });
    expect(api.getBranding).toHaveBeenCalledExactlyOnceWith({ signal: expect.any(AbortSignal), timeoutMs: 10_000 });
    controller.setAccess(scope, true, api); await tick();
    expect(api.getBranding).toHaveBeenCalledOnce();
  });

  it("coalesces refreshes, applies runtime updates and preserves identity without native rebuilding", async () => {
    const next = deferred<RestaurantBrandingResponse>();
    const api = { getBranding: vi.fn().mockResolvedValueOnce(brand).mockImplementationOnce(() => next.promise) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api); await tick();
    const first = controller.refresh(); const second = controller.refresh(); await tick();
    expect(api.getBranding).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ branding: brand, refreshing: true });
    next.resolve({ ...brand, displayName: "Renamed A", palette: { ...palette, primaryColor: "#124981" }, revision: 2 });
    expect(await first).toBe(true); expect(await second).toBe(true);
    expect(controller.getState().branding).toMatchObject({ restaurantId: a, displayName: "Renamed A", revision: 2 });
  });

  it.each([new ApiNetworkError(), new ApiTimeoutError()])("retains the last valid same-scope snapshot after %s", async error => {
    const api = { getBranding: vi.fn().mockResolvedValueOnce(brand).mockRejectedValueOnce(error) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api); await tick();
    expect(await controller.refresh()).toBe(false);
    expect(controller.getState()).toMatchObject({ branding: brand, error: "offline", refreshing: false });
  });

  it("exposes safe first-load failure and accepts canonical uninitialized branding", async () => {
    const api = { getBranding: vi.fn().mockRejectedValueOnce(new ApiNetworkError()).mockResolvedValueOnce({ ...brand, palette: null, revision: 0 }) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api); await tick();
    expect(controller.getState()).toMatchObject({ branding: null, loading: false, error: "offline" });
    expect(await controller.refresh()).toBe(true);
    expect(controller.getState().branding).toMatchObject({ palette: null, revision: 0 });
  });

  it.each([
    { ...brand, restaurantId: b }, { ...brand, displayName: "" }, { ...brand, revision: -1 },
    { ...brand, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...brand, palette: null },
    { ...brand, palette: { ...palette, primaryColor: "red" } }, { ...brand, revision: 0 },
    { ...brand, revision: 0, palette: undefined }
  ])("rejects malformed, foreign or inconsistent snapshots without replacing valid branding", async invalid => {
    const api = { getBranding: vi.fn().mockResolvedValueOnce(brand).mockResolvedValueOnce(invalid) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api); await tick();
    expect(await controller.refresh()).toBe(false);
    expect(controller.getState()).toMatchObject({ branding: brand, error: "error" });
  });

  it("rejects a palette revision rollback while allowing name/logo refresh at the same palette revision", async () => {
    const api = { getBranding: vi.fn().mockResolvedValueOnce({ ...brand, revision: 3 })
      .mockResolvedValueOnce({ ...brand, revision: 2 }).mockResolvedValueOnce({ ...brand, displayName: "New name", revision: 3 }) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api); await tick();
    expect(await controller.refresh()).toBe(false);
    expect(controller.getState().branding?.revision).toBe(3);
    expect(await controller.refresh()).toBe(true);
    expect(controller.getState().branding?.displayName).toBe("New name");
  });

  it.each(["tenant", "environment", "origin", "account"])("clears memory and rejects a late response after a %s scope change", async reason => {
    const old = deferred<RestaurantBrandingResponse>();
    const api = { getBranding: vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce({ ...brand, restaurantId: reason === "tenant" ? b : a, displayName: "Current" }) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api); await tick();
    const signal = api.getBranding.mock.calls[0][0].signal as AbortSignal;
    const next = { key: `${scope.key}:${reason}`, restaurantId: reason === "tenant" ? b : a };
    controller.setAccess(next, true, api);
    expect(controller.getState().branding).toBeNull(); expect(signal.aborted).toBe(true);
    old.resolve(brand); await tick();
    expect(controller.getState().branding?.displayName).toBe("Current");
    expect(await controller.refresh(scope.key)).toBe(false);
  });

  it("pauses and aborts in background, retains the safe theme, and reads once on foreground", async () => {
    const old = deferred<RestaurantBrandingResponse>();
    const api = { getBranding: vi.fn().mockResolvedValueOnce(brand).mockImplementationOnce(() => old.promise).mockResolvedValueOnce({ ...brand, revision: 2 }) };
    const controller = createCustomerBrandingController();
    controller.setAccess(scope, true, api); await tick();
    const pending = controller.refresh(); await tick();
    controller.setAccess(scope, false, api);
    expect(api.getBranding.mock.calls[1][0].signal.aborted).toBe(true);
    old.resolve({ ...brand, displayName: "Obsolete" }); expect(await pending).toBe(false);
    expect(controller.getState().branding).toEqual(brand);
    expect(await controller.refresh()).toBe(false);
    controller.setAccess(scope, true, api); await tick();
    expect(api.getBranding).toHaveBeenCalledTimes(3);
    expect(controller.getState().branding?.revision).toBe(2);
  });

  it("disposes pending work and listeners without publishing late data", async () => {
    const pending = deferred<RestaurantBrandingResponse>();
    const api = { getBranding: vi.fn().mockImplementation(() => pending.promise) };
    const controller = createCustomerBrandingController(); const listener = vi.fn(); controller.subscribe(listener);
    controller.setAccess(scope, true, api); await tick(); listener.mockClear();
    controller.dispose(); pending.resolve(brand); await tick();
    expect(api.getBranding.mock.calls[0][0].signal.aborted).toBe(true);
    expect(listener).not.toHaveBeenCalled(); expect(await controller.refresh()).toBe(false);
    controller.setAccess(scope, true, api); expect(api.getBranding).toHaveBeenCalledOnce();
  });
});
