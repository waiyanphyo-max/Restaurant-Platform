import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAddressResponse, CustomerProfileResponse } from "@restaurant-platform/shared-types";
import type { QueryState } from "../../hooks/useApiQuery";

interface Account { profile: CustomerProfileResponse; addresses: CustomerAddressResponse[]; }
const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], cleanups: [] as (() => void)[],
  stateIndex: 0, refIndex: 0, effectIndex: 0,
  account: { status: "loading" } as QueryState<Account>, notificationsEnabled: false,
  reload: vi.fn(), editAddress: vi.fn(), signOut: vi.fn(), updateProfile: vi.fn(), setDefault: vi.fn(), deleteAddress: vi.fn(),
  enableNotifications: vi.fn(), cleanup: vi.fn(), navigate: vi.fn()
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useCallback<T>(callback: T) { return callback; },
  useState(initial: unknown) {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value; }];
  },
  useRef(initial: unknown) {
    const index = harness.refIndex++; harness.refs[index] ??= { current: initial }; return harness.refs[index];
  },
  useEffect(effect: () => (() => void)) {
    const index = harness.effectIndex++; if (!(index in harness.cleanups)) harness.cleanups[index] = effect();
  }
}));
vi.mock("react-native", () => ({ Text: "Text", View: "View" }));
vi.mock("expo-router", () => ({ useRouter: () => ({ navigate: harness.navigate }) }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", FormField: "FormField", Page: "Page", StateView: "StateView" }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ updateProfile: harness.updateProfile, setDefaultAddress: harness.setDefault, deleteAddress: harness.deleteAddress }) }));
vi.mock("../../auth/AuthProvider", () => ({ useCustomerAuth: () => ({ signOut: harness.signOut }) }));
vi.mock("../../notifications/native", () => ({ enableCustomerNotifications: harness.enableNotifications, retryCustomerDeviceCleanup: harness.cleanup }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ notificationsEnabled: harness.notificationsEnabled }) }));
vi.mock("./AccountProvider", () => ({
  useCustomerAccount: () => ({ state: harness.account, reload: harness.reload, editAddress: harness.editAddress }),
  homeAddress: (addresses: CustomerAddressResponse[]) => addresses.find(address => address.label === "Home")
}));
import { ProfileScreen } from "./ProfileScreen";

const profile: CustomerProfileResponse = {
  id: "00000000-0000-4000-8000-000000000002", fullName: "Private Customer", phone: "+959123456789",
  preferredLanguage: "en", avatarUrl: null, createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z"
};
const home: CustomerAddressResponse = {
  id: "00000000-0000-4000-8000-000000000001", label: "Home", recipientName: "Private Recipient",
  houseNo: "Room 4", street: "Private Street", ward: null, township: "Dagon", city: "Yangon",
  latitude: 16.8, longitude: 96.1, deliveryNote: "Landmark", isDefault: true,
  createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z"
};
function render() { harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0; return ProfileScreen(); }
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function action(tree: ReactNode, title: string) {
  const found = elements(tree).find(item => item.type === "Action" && item.props.title === title);
  if (!found) throw new Error(`Action missing: ${title}`);
  return found.props as { onPress(): void; disabled?: boolean };
}
function textContent(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (isValidElement<Record<string, unknown>>(node)) return textContent(node.props.children as ReactNode);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("customer profile and saved-address access", () => {
  beforeEach(() => {
    harness.states = []; harness.refs = []; harness.cleanups = []; harness.notificationsEnabled = false;
    harness.account = { status: "ready", data: { profile, addresses: [home] } };
    harness.reload.mockReset(); harness.editAddress.mockReset(); harness.signOut.mockReset().mockResolvedValue(undefined);
    harness.updateProfile.mockReset().mockResolvedValue(profile); harness.setDefault.mockReset().mockResolvedValue(home);
    harness.deleteAddress.mockReset().mockResolvedValue(undefined); harness.navigate.mockReset();
    harness.enableNotifications.mockReset().mockResolvedValue("Provider setup is unavailable."); harness.cleanup.mockReset().mockResolvedValue(undefined);
  });

  it.each(["loading", "offline", "error", "denied"] as const)("hides profile/address details in %s state and provides retry/logout", status => {
    harness.account = { status }; const tree = render();
    const state = elements(tree).find(item => item.type === "StateView")!;
    expect(state.props.kind).toBe(status);
    (state.props.onRetry as () => void)(); expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(textContent(tree)).not.toContain("Private");
    expect(elements(tree).some(item => item.type === "FormField")).toBe(false);
    action(tree, "Log out").onPress(); expect(harness.signOut).toHaveBeenCalledTimes(1);
  });

  it("displays the saved Home Address and opens that owned address for editing", () => {
    const tree = render(); expect(textContent(tree)).toContain("Private Street");
    expect(textContent(tree)).toContain("Map location saved");
    action(tree, "Change saved Home Address").onPress();
    expect(harness.editAddress).toHaveBeenCalledExactlyOnceWith(home);
  });

  it("supports an empty address list and optional later setup", () => {
    harness.account = { status: "ready", data: { profile, addresses: [] } };
    const tree = render(); expect(textContent(tree)).toContain("No Home Address saved yet");
    action(tree, "Set up Home Address").onPress(); expect(harness.editAddress).toHaveBeenCalledExactlyOnceWith();
  });

  it("updates account contact details through the profile API without touching addresses", async () => {
    let tree = render(); action(tree, "Edit account details").onPress(); tree = render();
    const phone = elements(tree).find(item => item.type === "FormField" && item.props.label === "Contact phone (required)")!;
    (phone.props.onChangeText as (value: string) => void)("+959222333444");
    tree = render(); action(tree, "Save account details").onPress(); await tick();
    expect(harness.updateProfile).toHaveBeenCalledExactlyOnceWith({ fullName: profile.fullName, phone: "+959222333444", preferredLanguage: "en" });
    expect(harness.setDefault).not.toHaveBeenCalled(); expect(harness.editAddress).not.toHaveBeenCalled();
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it("sets a saved owned address as default using only its server-returned ID", async () => {
    const work = { ...home, id: "00000000-0000-4000-8000-000000000003", label: "Work", isDefault: false };
    harness.account = { status: "ready", data: { profile, addresses: [home, work] } };
    const tree = render(); action(tree, "Use as default").onPress(); await tick();
    expect(harness.setDefault).toHaveBeenCalledExactlyOnceWith(work.id);
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it("explains the required contact phone to a new customer editing a name, then accepts corrected trimmed details", async () => {
    harness.account = { status: "ready", data: { profile: { ...profile, fullName: null, phone: null }, addresses: [] } };
    let tree = render(); action(tree, "Edit account details").onPress(); tree = render();
    const name = elements(tree).find(item => item.type === "FormField" && item.props.label === "Full name (required)")!;
    (name.props.onChangeText as (value: string) => void)("  New Customer  "); tree = render();
    action(tree, "Save account details").onPress(); tree = render();
    expect(harness.updateProfile).not.toHaveBeenCalled();
    let phone = elements(tree).find(item => item.type === "FormField" && item.props.label === "Contact phone (required)")!;
    expect(phone.props.error).toContain("Enter a contact phone number");
    expect(phone.props.error).toContain("does not verify your sign-in phone");
    (phone.props.onChangeText as (value: string) => void)("  +959222333444  "); tree = render();
    phone = elements(tree).find(item => item.type === "FormField" && item.props.label === "Contact phone (required)")!;
    expect(phone.props.error).toBeUndefined();
    action(tree, "Save account details").onPress(); await tick();
    expect(harness.updateProfile).toHaveBeenCalledExactlyOnceWith({ fullName: "New Customer", phone: "+959222333444", preferredLanguage: "en" });
  });

  it.each([
    ["Full name (required)", "   ", "Enter your full name"],
    ["Contact phone (required)", "   ", "Enter a contact phone number"],
    ["Full name (required)", "x".repeat(151), "150 characters"],
    ["Contact phone (required)", "x".repeat(31), "30 characters"]
  ])("validates %s locally before a profile mutation", (label, value, expected) => {
    let tree = render(); action(tree, "Edit account details").onPress(); tree = render();
    const field = elements(tree).find(item => item.type === "FormField" && item.props.label === label)!;
    (field.props.onChangeText as (next: string) => void)(value); tree = render();
    action(tree, "Save account details").onPress(); tree = render();
    expect(elements(tree).find(item => item.type === "FormField" && item.props.label === label)?.props.error).toContain(expected);
    expect(harness.updateProfile).not.toHaveBeenCalled();
  });

  it("gates notification setup when provider configuration is unavailable", () => {
    const tree = render(); expect(action(tree, "Enable notifications").disabled).toBe(true);
    expect(textContent(tree)).toContain("not configured"); expect(harness.enableNotifications).not.toHaveBeenCalled();
  });

  it("requires confirmation before deleting the selected saved address", async () => {
    action(render(), "Delete saved address").onPress();
    expect(harness.deleteAddress).not.toHaveBeenCalled();
    action(render(), "Cancel").onPress();
    expect(harness.deleteAddress).not.toHaveBeenCalled();
    action(render(), "Delete saved address").onPress();
    action(render(), "Confirm address deletion").onPress();
    await tick();
    expect(harness.deleteAddress).toHaveBeenCalledExactlyOnceWith(home.id);
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it("localizes profile actions from the persisted Burmese preference", () => {
    harness.account = { status: "ready", data: { profile: { ...profile, preferredLanguage: "my-MM" }, addresses: [home] } };
    const tree = render();
    expect(tree.props.title).toBe("ပရိုဖိုင်");
    action(tree, "အသိပေးချက်မှတ်တမ်း ကြည့်ရန်").onPress();
    expect(harness.navigate).toHaveBeenCalledExactlyOnceWith("/notifications");
  });

  it("reports the notification adapter result without inventing delivery success", async () => {
    harness.notificationsEnabled = true; let tree = render();
    action(tree, "Enable notifications").onPress(); await tick(); tree = render();
    expect(textContent(tree)).toContain("Provider setup is unavailable.");
  });
});
