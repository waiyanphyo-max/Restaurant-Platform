import React, { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantAccessError } from "@restaurant-platform/api-client";
import type { RestaurantBrandingResponse, UpdateRestaurantBrandingRequest } from "@restaurant-platform/shared-types";
import type { OperationsAccessState } from "../auth/access";
import type { VerifiedWorkspace } from "../auth/workspace";
import type { RuntimeBrandingState } from "./runtime";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as unknown[], stateIndex: 0, refIndex: 0, effectIndex: 0,
  effects: [] as { dependencies: readonly unknown[]; cleanup?: () => void; run: () => void | (() => void) }[],
  queued: [] as number[],
  auth: { state: { status: "loading" } as OperationsAccessState, workspace: null as VerifiedWorkspace | null,
    signOut: vi.fn().mockResolvedValue(undefined), assertWorkspaceAccess: vi.fn() },
  tenant: { restaurantId: "11111111-1111-4111-8111-111111111111", environment: "staging", apiBaseUrl: "https://api-a.example.test",
    branding: { displayName: "Embedded A", primaryColor: "#234D3C", secondaryColor: "#E8EEDB", backgroundColor: "#FFFFFF", logoDataUri: "data:image/png;base64,embedded-a" } },
  api: { getBranding: vi.fn(), updateBranding: vi.fn() },
  apiFactory: vi.fn()
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
vi.mock("../auth/AuthProvider", () => ({ useOperationsAuth: () => harness.auth }));
vi.mock("../tenant", () => ({ readEmbeddedTenant: () => harness.tenant }));
vi.mock("../api", () => ({ getOperationsApi: (...args: unknown[]) => { harness.apiFactory(...args); return harness.api; } }));
vi.mock("../components/ui", () => ({ ThemeProvider: "theme-provider" }));
import { RuntimeBrandingProvider } from "./RuntimeBrandingProvider";

const palette = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const persisted: RestaurantBrandingResponse = { restaurantId: harness.tenant.restaurantId, displayName: "Server A",
  logoUrl: "https://media.example.test/a.png", palette, revision: 1 };
type Value = RuntimeBrandingState & { displayName: string; logoUrl: string | null;
  refresh(): Promise<boolean>; save(request: UpdateRestaurantBrandingRequest): Promise<RestaurantBrandingResponse> };
function render(effects = true) {
  harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
  const element = RuntimeBrandingProvider({ children: <p>Workspace</p> }) as ReactElement<{
    value: Value; children: ReactElement<{ restaurantId: string; branding: typeof palette | null | undefined }>;
  }>;
  if (effects) {
    for (const index of harness.queued.splice(0)) {
      const effect = harness.effects[index];
      effect.cleanup?.();
      effect.cleanup = effect.run() ?? undefined;
    }
  }
  return { value: element.props.value, theme: element.props.children.props };
}
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function ready(role: "OWNER" | "MANAGER" | "STAFF" = "OWNER"): VerifiedWorkspace {
  return { status: "ready", userId: "member-a", membership: { restaurantId: harness.tenant.restaurantId, name: "A", slug: "a", role, active: true } };
}

beforeEach(() => {
  harness.effects.forEach(effect => effect.cleanup?.());
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  harness.states = []; harness.refs = []; harness.effects = []; harness.queued = [];
  harness.tenant.restaurantId = persisted.restaurantId;
  harness.tenant.environment = "staging"; harness.tenant.apiBaseUrl = "https://api-a.example.test";
  harness.auth.state = ready(); harness.auth.workspace = harness.auth.state;
  harness.auth.assertWorkspaceAccess.mockReset();
  harness.api.getBranding.mockReset().mockResolvedValue(persisted);
  harness.api.updateBranding.mockReset().mockResolvedValue({ ...persisted, revision: 2 });
});

describe("runtime provider, workspace and auth lifecycle integration", () => {
  it("loads on an authorized workspace and supplies runtime identity and palette to the existing ThemeProvider", async () => {
    const initial = render();
    expect(initial.value).toMatchObject({ branding: null, displayName: "Embedded A", logoUrl: harness.tenant.branding.logoDataUri });
    await tick();
    const loaded = render();
    expect(loaded.value).toMatchObject({ branding: persisted, displayName: "Server A", logoUrl: persisted.logoUrl });
    expect(loaded.theme).toMatchObject({ restaurantId: persisted.restaurantId, branding: palette });
    expect(harness.api.getBranding).toHaveBeenCalledOnce();
    expect(harness.apiFactory).toHaveBeenCalledWith(expect.objectContaining({ userId: "member-a", assertCurrentAccess: expect.any(Function) }));
  });

  it("reuses existing auth foreground transitions, keeps the theme while hidden and issues one fresh read on ready", async () => {
    render(); await tick();
    harness.auth.state = { status: "checking_membership", userId: "member-a" };
    expect(render().value.branding).toEqual(persisted);
    harness.auth.state = harness.auth.workspace!;
    render(); render(); render();
    await tick();
    expect(harness.api.getBranding).toHaveBeenCalledTimes(2);
    expect(render().value.branding).toEqual(persisted);
  });

  it.each(["environment", "origin", "tenant", "role"])("renders embedded fallback immediately on a %s scope change before effects run", async reason => {
    render(); await tick();
    const old = render().value.scopeKey;
    if (reason === "environment") harness.tenant.environment = "production";
    if (reason === "origin") harness.tenant.apiBaseUrl = "https://api-b.example.test";
    if (reason === "tenant") harness.tenant.restaurantId = "22222222-2222-4222-8222-222222222222";
    if (reason === "role") { harness.auth.state = ready("MANAGER"); harness.auth.workspace = harness.auth.state; }
    const immediate = render(false);
    expect(immediate.value.scopeKey).not.toBe(old);
    expect(immediate.value.branding).toBeNull();
    expect(immediate.value.displayName).toBe("Embedded A");
    expect(immediate.theme.branding).toBeUndefined();
  });

  it("aborts a pending fetch and clears current identity after sign-out", async () => {
    let complete!: (value: RestaurantBrandingResponse) => void;
    harness.api.getBranding.mockImplementationOnce(() => new Promise<RestaurantBrandingResponse>(resolve => { complete = resolve; }));
    render(); await tick();
    const signal = harness.api.getBranding.mock.calls[0][0].signal as AbortSignal;
    harness.auth.state = { status: "signed_out" }; harness.auth.workspace = null;
    const signedOut = render();
    expect(signal.aborted).toBe(true);
    expect(signedOut.value.branding).toBeNull();
    complete(persisted); await tick();
    expect(render().value.branding).toBeNull();
    expect(render().value.displayName).toBe("Embedded A");
  });

  it("checks live workspace access after a pending fetch before applying a response, even before an auth rerender", async () => {
    render(); await tick();
    let complete!: (value: RestaurantBrandingResponse) => void;
    harness.api.getBranding.mockImplementationOnce(() => new Promise<RestaurantBrandingResponse>(resolve => { complete = resolve; }));
    const refreshing = render().value.refresh();
    await tick();
    harness.auth.assertWorkspaceAccess.mockImplementation(() => { throw new TenantAccessError(); });
    complete({ ...persisted, displayName: "Revoked response", revision: 2 });
    expect(await refreshing).toBe(false);
    expect(render().value).toMatchObject({ branding: persisted, error: "denied" });
  });

  it("uses same-tenant embedded logo fallback for an absent safe runtime logo and keeps revision zero unsaved", async () => {
    harness.api.getBranding.mockResolvedValueOnce({ ...persisted, palette: null, logoUrl: null, revision: 0 });
    render(); await tick();
    const value = render();
    expect(value.value).toMatchObject({ branding: { palette: null, revision: 0 }, logoUrl: harness.tenant.branding.logoDataUri });
    expect(value.theme.branding).toBeNull();
    expect(harness.api.updateBranding).not.toHaveBeenCalled();
  });

  it("aborts a pending scoped write when the workspace unmounts without claiming success", async () => {
    render(); await tick();
    let complete!: (value: RestaurantBrandingResponse) => void;
    harness.api.updateBranding.mockImplementationOnce(() => new Promise<RestaurantBrandingResponse>(resolve => { complete = resolve; }));
    const saving = render().value.save({ expectedRevision: 1, palette });
    const signal = harness.api.updateBranding.mock.calls[0][1].signal as AbortSignal;
    harness.effects.forEach(effect => effect.cleanup?.());
    expect(signal.aborted).toBe(true);
    complete({ ...persisted, revision: 2 });
    await expect(saving).rejects.toMatchObject({ name: "ApiCancelledError" });
  });
});
