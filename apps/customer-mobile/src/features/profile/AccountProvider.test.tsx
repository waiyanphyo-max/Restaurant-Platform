import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAddressResponse, CustomerProfileResponse } from "@restaurant-platform/shared-types";
import type { QueryState } from "../../hooks/useApiQuery";

interface Account { profile: CustomerProfileResponse; addresses: CustomerAddressResponse[]; }
const harness = vi.hoisted(() => ({
  states: [] as unknown[], stateIndex: 0,
  state: { status: "loading" } as QueryState<Account>, pathname: "/home",
  auth: { status: "signed_in", userId: "00000000-0000-4000-8000-000000000002" },
  effects: [] as readonly unknown[][], effectIndex: 0,
  query: null as null | ((signal: AbortSignal) => Promise<Account>),
  replace: vi.fn(), push: vi.fn(), reload: vi.fn(), getProfile: vi.fn(), listAddresses: vi.fn(), resumeNotifications: vi.fn()
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useEffect(effect: () => void, dependencies: unknown[]) {
    const index = harness.effectIndex++;
    const previous = harness.effects[index];
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous[item]))) {
      harness.effects = Object.assign([...harness.effects], { [index]: dependencies }); effect();
    }
  }
}));
vi.mock("expo-router", () => ({ usePathname: () => harness.pathname, useRouter: () => ({ replace: harness.replace, push: harness.push }) }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ getProfile: harness.getProfile, listAddresses: harness.listAddresses }) }));
vi.mock("../../auth/AuthProvider", () => ({ useCustomerAuth: () => ({ state: harness.auth }) }));
vi.mock("../../notifications/native", () => ({ resumeCustomerNotifications: harness.resumeNotifications }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery(query: (signal: AbortSignal) => Promise<Account>) {
  harness.query = query;
  return { state: harness.state, reload: harness.reload };
} }));
import { CustomerAccountProvider, homeAddress, needsAddressOnboarding } from "./AccountProvider";

const address: CustomerAddressResponse = {
  id: "00000000-0000-4000-8000-000000000001", label: "Home", recipientName: null,
  houseNo: null, street: "Private Street", ward: null, township: "Dagon", city: "Yangon",
  latitude: 16.8, longitude: 96.1, deliveryNote: null, isDefault: true,
  createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z"
};
const profile: CustomerProfileResponse = {
  id: "00000000-0000-4000-8000-000000000002", fullName: "Customer", phone: null,
  preferredLanguage: "en", avatarUrl: null, createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z"
};
interface ContextValue {
  state: QueryState<Account>; editingAddress: CustomerAddressResponse | null;
  dismissOnboarding(): void; editAddress(address?: CustomerAddressResponse): void; reload(): void;
}
function render(): ContextValue {
  harness.stateIndex = 0;
  harness.effectIndex = 0;
  const tree = CustomerAccountProvider({ children: null }) as ReactElement<{ value: ContextValue }>;
  return tree.props.value;
}

describe("first-time customer account onboarding", () => {
  beforeEach(() => {
    harness.states = []; harness.effects = []; harness.state = { status: "loading" }; harness.pathname = "/home";
    harness.auth = { status: "signed_in", userId: profile.id };
    harness.replace.mockReset(); harness.push.mockReset(); harness.reload.mockReset();
    harness.getProfile.mockReset().mockResolvedValue(profile); harness.listAddresses.mockReset().mockResolvedValue([]);
    harness.resumeNotifications.mockReset().mockResolvedValue(undefined);
  });

  it("offers address setup after authenticated profile and empty addresses are retrieved", () => {
    harness.state = { status: "ready", data: { profile, addresses: [] } };
    const context = render();
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/address");
    expect(context.editingAddress).toBeNull();
    expect(needsAddressOnboarding([], false)).toBe(true);
  });

  it.each(["loading", "offline", "error", "denied"] as const)("does not treat %s restoration as a new customer", status => {
    harness.state = { status }; const context = render();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(context.state).toEqual({ status });
    expect("data" in context.state).toBe(false);
  });

  it("does not interrupt customers who already have saved addresses", () => {
    harness.state = { status: "ready", data: { profile, addresses: [address] } }; render();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(needsAddressOnboarding([address], false)).toBe(false);
  });

  it("respects Skip for Now for the rest of the signed-in account session", () => {
    harness.state = { status: "ready", data: { profile, addresses: [] } };
    const context = render(); context.dismissOnboarding(); harness.replace.mockClear();
    harness.pathname = "/profile"; render();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(needsAddressOnboarding([], true)).toBe(false);
  });

  it("does not repeatedly redirect when already displaying address setup", () => {
    harness.pathname = "/address"; harness.state = { status: "ready", data: { profile, addresses: [] } }; render();
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it("passes the selected owned response into editing state without address route parameters", () => {
    harness.state = { status: "ready", data: { profile, addresses: [address] } };
    render().editAddress(address);
    expect(harness.push).toHaveBeenCalledExactlyOnceWith("/address");
    expect(render().editingAddress).toBe(address);
    render().editAddress(); expect(render().editingAddress).toBeNull();
  });

  it("loads the profile and saved location through the authenticated API with the same cancellation scope", async () => {
    harness.listAddresses.mockResolvedValue([address]); render();
    const controller = new AbortController();
    await expect(harness.query!(controller.signal)).resolves.toEqual({ profile, addresses: [address] });
    expect(harness.getProfile).toHaveBeenCalledWith({ signal: controller.signal });
    expect(harness.listAddresses).toHaveBeenCalledWith({ signal: controller.signal });
  });

  it("keeps account loading atomic when address retrieval fails", async () => {
    harness.listAddresses.mockRejectedValue(new Error("Address access denied")); render();
    await expect(harness.query!(new AbortController().signal)).rejects.toThrow("Address access denied");
  });

  it("rejects a profile whose server response identity differs from the authenticated customer", async () => {
    harness.getProfile.mockResolvedValue({ ...profile, id: "00000000-0000-4000-8000-000000000099" }); render();
    await expect(harness.query!(new AbortController().signal)).rejects.toMatchObject({ name: "ApiProtocolError" });
  });

  it("rejects malformed profiles before publishing any account data", async () => {
    harness.getProfile.mockResolvedValue(null); render();
    await expect(harness.query!(new AbortController().signal)).rejects.toMatchObject({ name: "ApiProtocolError" });
  });

  it("resumes opted-in notifications once per customer provider mount without affecting account access", async () => {
    harness.resumeNotifications.mockRejectedValue(new Error("Provider not available"));
    render(); render();
    await expect(harness.query!(new AbortController().signal)).resolves.toEqual({ profile, addresses: [] });
    expect(harness.resumeNotifications).toHaveBeenCalledTimes(1);
  });

  it("finds Home by label while preserving other default addresses", () => {
    const work = { ...address, label: "Work", isDefault: true };
    const home = { ...address, label: " HOME ", isDefault: false };
    expect(homeAddress([work, home])).toBe(home);
    expect(homeAddress([work])).toBeUndefined();
  });
});
