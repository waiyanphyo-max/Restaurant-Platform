import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantBrandingResponse } from "@restaurant-platform/shared-types";
import type { CustomerAuthState } from "../auth/flow";
import type { CustomerBrandingState } from "./runtime";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as unknown[], stateIndex: 0, refIndex: 0, effectIndex: 0,
  effects: [] as { dependencies: readonly unknown[]; cleanup?: () => void; run: () => void | (() => void) }[],
  queued: [] as number[], listeners: new Set<(state: string) => void>(),
  auth: { status: "signed_out" } as CustomerAuthState,
  tenant: { restaurantId: "11111111-1111-4111-8111-111111111111", environment: "staging", apiBaseUrl: "https://api-a.example.test",
    branding: { displayName: "Embedded A", primaryColor: "#234D3C", secondaryColor: "#E8EEDB", backgroundColor: "#FFFFFF", logoDataUri: "data:image/png;base64,embedded-a" } },
  api: { getBranding: vi.fn() }, apiFactory: vi.fn()
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useCallback: <T,>(callback: T) => callback,
  useRef: <T,>(initial: T) => {
    const index = harness.refIndex++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index] as { current: T };
  },
  useState: <T,>(initial: T) => {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: T) => { harness.states[index] = next; }];
  },
  useEffect: (run: () => void | (() => void), dependencies: readonly unknown[]) => {
    const index = harness.effectIndex++;
    const old = harness.effects[index];
    if (!old || dependencies.some((value, i) => value !== old.dependencies[i])) {
      harness.effects[index] = { dependencies, run, cleanup: old?.cleanup };
      harness.queued.push(index);
    }
  }
}));
vi.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener(_event: string, callback: (state: string) => void) {
  harness.listeners.add(callback); return { remove() { harness.listeners.delete(callback); } };
} } }));
vi.mock("../auth/AuthProvider", () => ({ useCustomerAuth: () => ({ state: harness.auth }) }));
vi.mock("../tenant", () => ({ readEmbeddedTenant: () => harness.tenant }));
vi.mock("../api", () => ({ getCustomerPublicApi: (...args: unknown[]) => { harness.apiFactory(...args); return harness.api; } }));
vi.mock("../components/ui", () => ({ ThemeProvider: "theme-provider" }));
import { RuntimeBrandingProvider } from "./RuntimeBrandingProvider";

const palette = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const persisted: RestaurantBrandingResponse = { restaurantId: harness.tenant.restaurantId, displayName: "Server A",
  logoUrl: "https://media.example.test/a.png", palette, revision: 1 };
type Value = CustomerBrandingState & { displayName: string; logoUrl: string | null; refresh(): Promise<boolean> };
function render(effects = true) {
  harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
  const element = RuntimeBrandingProvider({ children: <p>Customer</p> }) as ReactElement<{
    value: Value; children: ReactElement<{ restaurantId: string; branding: typeof palette | null | undefined }>;
  }>;
  if (effects) {
    for (const index of harness.queued.splice(0)) {
      const effect = harness.effects[index]; effect.cleanup?.(); effect.cleanup = effect.run() ?? undefined;
    }
  }
  return { value: element.props.value, theme: element.props.children.props };
}
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const unmount = () => harness.effects.forEach(effect => effect.cleanup?.());

beforeEach(() => {
  vi.stubGlobal("React", React); vi.clearAllMocks();
  harness.states = []; harness.refs = []; harness.effects = []; harness.queued = []; harness.listeners.clear();
  harness.auth = { status: "signed_out" };
  harness.tenant.restaurantId = persisted.restaurantId; harness.tenant.environment = "staging"; harness.tenant.apiBaseUrl = "https://api-a.example.test";
  harness.api.getBranding.mockReset().mockResolvedValue(persisted);
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

describe("Customer runtime branding provider lifecycle", () => {
  it("loads public runtime identity at sign-in without requiring credentials, then feeds the existing ThemeProvider", async () => {
    const initial = render();
    expect(initial.value).toMatchObject({ branding: null, displayName: "Embedded A", logoUrl: harness.tenant.branding.logoDataUri });
    await tick();
    expect(render().value).toMatchObject({ branding: persisted, displayName: "Server A", logoUrl: persisted.logoUrl });
    expect(render().theme).toEqual({ restaurantId: persisted.restaurantId, branding: palette, children: <p>Customer</p> });
    expect(harness.apiFactory).toHaveBeenCalledExactlyOnceWith();
    expect(harness.api.getBranding).toHaveBeenCalledOnce(); expect(harness.listeners.size).toBe(1);
  });

  it.each(["loading", "error", "unconfigured"] as const)("does not read while auth is %s", async status => {
    harness.auth = { status }; render(); await tick();
    expect(harness.api.getBranding).not.toHaveBeenCalled();
    expect(render().value).toMatchObject({ branding: null, displayName: "Embedded A" });
    harness.auth = { status: "signed_out" }; render(); await tick();
    expect(harness.api.getBranding).toHaveBeenCalledOnce();
  });

  it("retains same-scope safe identity offline and uses the embedded logo for a missing safe runtime logo", async () => {
    harness.api.getBranding.mockResolvedValueOnce({ ...persisted, palette: null, logoUrl: null, revision: 0 });
    render(); await tick();
    expect(render().value).toMatchObject({ displayName: "Server A", logoUrl: harness.tenant.branding.logoDataUri, branding: { palette: null, revision: 0 } });
    expect(render().theme.branding).toBeNull();
    harness.api.getBranding.mockRejectedValueOnce(new Error("offline"));
    expect(await render().value.refresh()).toBe(false);
    expect(render().value.displayName).toBe("Server A");
  });

  it.each(["environment", "origin", "tenant", "account", "sign-out"])("hides old data at render time and aborts requests after %s changes", async reason => {
    render(); await tick();
    let complete!: (value: RestaurantBrandingResponse) => void;
    harness.api.getBranding.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const previous = render().value; const refreshing = previous.refresh(); await tick();
    const signal = harness.api.getBranding.mock.calls[1][0].signal as AbortSignal;
    if (reason === "environment") harness.tenant.environment = "production";
    if (reason === "origin") harness.tenant.apiBaseUrl = "https://api-b.example.test";
    if (reason === "tenant") harness.tenant.restaurantId = "22222222-2222-4222-8222-222222222222";
    if (reason === "account") harness.auth = { status: "signed_in", userId: "customer-b" };
    if (reason === "sign-out") harness.auth = { status: "loading" };
    const immediate = render(false);
    expect(immediate.value.branding).toBeNull(); expect(immediate.value.displayName).toBe("Embedded A");
    expect(immediate.theme.branding).toBeUndefined();
    render();
    expect(signal.aborted).toBe(true); expect(harness.listeners.size).toBe(1);
    complete({ ...persisted, displayName: "Obsolete" });
    expect(await refreshing).toBe(false);
    await tick();
    expect(render().value.displayName).not.toBe("Obsolete");
    expect(await previous.refresh()).toBe(false);
  });

  it("rejects a response completed after an auth rerender even before effect cleanup", async () => {
    render(); await tick();
    let complete!: (value: RestaurantBrandingResponse) => void;
    harness.api.getBranding.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const pending = render().value.refresh(); await tick();
    harness.auth = { status: "signed_in", userId: "customer-b" };
    render(false);
    complete({ ...persisted, displayName: "Obsolete" });
    expect(await pending).toBe(false);
    expect(render().value.displayName).toBe("Embedded A");
  });

  it("pauses in background and performs one refresh on foreground without polling", async () => {
    render(); await tick();
    harness.listeners.forEach(listener => listener("background"));
    expect(await render().value.refresh()).toBe(false);
    expect(render().value.branding).toEqual(persisted);
    harness.listeners.forEach(listener => listener("active"));
    harness.listeners.forEach(listener => listener("active")); await tick();
    expect(harness.api.getBranding).toHaveBeenCalledTimes(2);
  });

  it("aborts on unmount, removes its lifecycle listener and cannot apply a late response", async () => {
    let complete!: (value: RestaurantBrandingResponse) => void;
    harness.api.getBranding.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    render(); await tick();
    const signal = harness.api.getBranding.mock.calls[0][0].signal as AbortSignal;
    unmount(); expect(signal.aborted).toBe(true); expect(harness.listeners.size).toBe(0);
    complete(persisted); await tick();
    expect(harness.states[0]).toMatchObject({ branding: null });
  });

  it("survives StrictMode effect cleanup/replay with one live controller and lifecycle listener", async () => {
    let completeFirst!: (value: RestaurantBrandingResponse) => void;
    harness.api.getBranding.mockImplementationOnce(() => new Promise(resolve => { completeFirst = resolve; }));
    render(); await tick();
    const firstSignal = harness.api.getBranding.mock.calls[0][0].signal as AbortSignal;
    unmount();
    for (const effect of harness.effects) effect.cleanup = effect.run() ?? undefined;
    await tick();
    completeFirst({ ...persisted, displayName: "Disposed controller" }); await tick();
    expect(firstSignal.aborted).toBe(true);
    expect(harness.listeners.size).toBe(1); expect(harness.api.getBranding).toHaveBeenCalledTimes(2);
    expect(render().value.displayName).toBe("Server A");
  });
});
