import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAddressResponse } from "@restaurant-platform/shared-types";
import { ApiNetworkError } from "@restaurant-platform/api-client";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], cleanups: [] as (() => void)[],
  stateIndex: 0, refIndex: 0, effectIndex: 0,
  tenant: { mapsConfigured: true },
  createAddress: vi.fn(), updateAddress: vi.fn(), locate: vi.fn()
}));

vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value;
    }];
  },
  useRef(initial: unknown) {
    const index = harness.refIndex++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index];
  },
  useEffect(effect: () => (() => void)) {
    const index = harness.effectIndex++;
    if (!(index in harness.cleanups)) harness.cleanups[index] = effect();
  }
}));
vi.mock("react-native", () => ({ Switch: "Switch", Text: "Text", View: "View" }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", FormField: "FormField", Page: "Page" }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => harness.tenant }));
vi.mock("../../i18n", () => ({ useCustomerLanguage: () => "en", useCustomerText: () => (english: string) => english }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ createAddress: harness.createAddress, updateAddress: harness.updateAddress }) }));
vi.mock("./AddressMap", () => ({ AddressMap: "AddressMap" }));
vi.mock("./native-location", () => ({ suggestCurrentLocation: harness.locate }));

import { AddressScreen } from "./AddressScreen";
import { LocationSelectionError } from "./location";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function action(tree: ReactNode, title: string) {
  const found = elements(tree).find(element => element.type === "Action" && element.props.title === title);
  if (!found) throw new Error(`Action missing: ${title}`);
  return found.props as { onPress(): void; disabled?: boolean };
}
function field(tree: ReactNode, label: string) {
  const found = elements(tree).find(element => element.type === "FormField" && element.props.label === label);
  if (!found) throw new Error(`Field missing: ${label}`);
  return found.props as { onChangeText(value: string): void };
}
function map(tree: ReactNode) {
  const found = elements(tree).find(element => element.type === "AddressMap");
  if (!found) throw new Error("Map missing");
  return found.props as { onSelect(point: { latitude: number; longitude: number }): void; onConfirm(): void; onCancel(): void; notice: string | null; selection: { coordinates: { latitude: number; longitude: number } | null; confirmed: boolean } };
}
function textContent(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (isValidElement<Record<string, unknown>>(node)) return textContent(node.props.children as ReactNode);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const saved: CustomerAddressResponse = {
  id: "00000000-0000-4000-8000-000000000001", label: "Home", recipientName: "Customer", houseNo: null,
  street: "Main Street", ward: null, township: "Dagon", city: "Yangon", latitude: 16.8, longitude: 96.1,
  deliveryNote: null, isDefault: true, createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z"
};

describe("address screen integration", () => {
  beforeEach(() => {
    harness.states = []; harness.refs = []; harness.cleanups = [];
    harness.tenant.mapsConfigured = true;
    harness.createAddress.mockReset().mockResolvedValue(saved);
    harness.updateAddress.mockReset().mockResolvedValue(saved);
    harness.locate.mockReset().mockResolvedValue({ coordinates: { latitude: 17, longitude: 97 }, accuracyWarning: null });
  });

  function screen(address?: CustomerAddressResponse) {
    const onSaved = vi.fn(), onCancel = vi.fn();
    const render = () => {
      harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
      return AddressScreen({ address, onSaved, onCancel });
    };
    return { render, onSaved, onCancel };
  }

  it("offers optional setup immediately and skips without location or address writes", () => {
    const view = screen();
    const tree = view.render();
    expect(action(tree, "Choose Location on Map").disabled).toBe(false);
    action(tree, "Skip for Now").onPress();
    expect(view.onCancel).toHaveBeenCalledTimes(1);
    expect(harness.locate).not.toHaveBeenCalled();
    expect(harness.createAddress).not.toHaveBeenCalled();
  });

  it("opens Google map without requesting GPS, requires pin confirmation, then saves the selected pin", async () => {
    const view = screen();
    let tree = view.render();
    field(tree, "Township or Area").onChangeText("Dagon");
    field(tree, "City").onChangeText("Yangon");
    tree = view.render();
    action(tree, "Choose Location on Map").onPress();
    tree = view.render();
    map(tree).onSelect({ latitude: 16.9, longitude: 96.2 });
    tree = view.render();
    expect(map(tree).selection.confirmed).toBe(false);
    map(tree).onConfirm();
    tree = view.render();
    action(tree, "Review Address").onPress();
    tree = view.render();
    action(tree, "Save as Home Address").onPress();
    await tick();
    expect(harness.locate).not.toHaveBeenCalled();
    expect(harness.createAddress).toHaveBeenCalledWith(expect.objectContaining({ label: "Home", latitude: 16.9, longitude: 96.2 }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(view.onSaved).toHaveBeenCalledTimes(1);
  });

  it("blocks unconfirmed pins and supports continuing with a manual address", async () => {
    const view = screen(saved);
    let tree = view.render();
    action(tree, "Choose Location on Map").onPress();
    tree = view.render(); map(tree).onSelect({ latitude: 17, longitude: 97 });
    tree = view.render(); map(tree).onCancel();
    tree = view.render(); action(tree, "Review Address").onPress();
    tree = view.render(); expect(textContent(tree)).toContain("Confirm your selected location");
    action(tree, "Remove Location and Use Manual Address").onPress();
    tree = view.render(); action(tree, "Review Address").onPress();
    tree = view.render(); action(tree, "Save as Home Address").onPress();
    await tick();
    expect(harness.updateAddress).toHaveBeenCalledWith(saved.id, expect.objectContaining({ latitude: null, longitude: null }), expect.anything());
  });

  it("keeps an owned saved pin while updating details and never changes profile data", async () => {
    const view = screen(saved);
    let tree = view.render();
    field(tree, "Delivery Landmark and Instructions (Optional)").onChangeText("At the gate");
    tree = view.render(); action(tree, "Review Address").onPress();
    tree = view.render(); action(tree, "Save as Home Address").onPress(); await tick();
    expect(harness.updateAddress).toHaveBeenCalledWith(saved.id, expect.objectContaining({ latitude: 16.8, longitude: 96.1, deliveryNote: "At the gate" }), expect.anything());
    expect(harness.createAddress).not.toHaveBeenCalled();
    expect(view.onSaved).toHaveBeenCalledTimes(1);
  });

  it("gracefully disables maps and GPS when the Android key is missing", async () => {
    harness.tenant.mapsConfigured = false;
    const view = screen(); const tree = view.render();
    expect(action(tree, "Choose Location on Map").disabled).toBe(true);
    expect(action(tree, "Use My Current Location").disabled).toBe(true);
    action(tree, "Use My Current Location").onPress(); await tick();
    expect(harness.locate).not.toHaveBeenCalled();
    expect(textContent(tree)).toContain("Google Maps is unavailable");
    expect(field(tree, "City")).toBeDefined();
  });

  it("does not replace a manually selected pin with a late GPS suggestion", async () => {
    let finish!: (value: unknown) => void;
    harness.locate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = screen(); let tree = view.render();
    action(tree, "Use My Current Location").onPress();
    tree = view.render(); map(tree).onSelect({ latitude: 18, longitude: 98 });
    finish({ coordinates: { latitude: 17, longitude: 97 }, accuracyWarning: null }); await tick();
    tree = view.render();
    expect(map(tree).selection.coordinates).toEqual({ latitude: 18, longitude: 98 });
    expect(map(tree).selection.confirmed).toBe(false);
  });

  it("displays GPS as a suggestion requiring confirmation, with accuracy guidance", async () => {
    harness.locate.mockResolvedValue({ coordinates: { latitude: 17, longitude: 97 }, accuracyWarning: "Adjust the pin to the entrance." });
    const view = screen(); let tree = view.render();
    action(tree, "Use My Current Location").onPress(); await tick(); tree = view.render();
    expect(map(tree).selection.coordinates).toEqual({ latitude: 17, longitude: 97 });
    expect(map(tree).selection.confirmed).toBe(false);
    expect(map(tree).notice).toContain("Adjust the pin");
    expect(harness.createAddress).not.toHaveBeenCalled();
  });

  it.each(["denied", "unavailable", "timeout"] as const)("keeps manual pin selection available after GPS %s", async code => {
    harness.locate.mockRejectedValue(new LocationSelectionError(code));
    const view = screen(); let tree = view.render();
    action(tree, "Use My Current Location").onPress(); await tick(); tree = view.render();
    expect(map(tree).notice).toBe(new LocationSelectionError(code).message);
    map(tree).onSelect({ latitude: 18, longitude: 98 }); tree = view.render();
    expect(map(tree).selection.coordinates).toEqual({ latitude: 18, longitude: 98 });
  });

  it("ignores location and address completion callbacks after unmount", async () => {
    let finish!: () => void;
    harness.updateAddress.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const view = screen(saved); let tree = view.render();
    action(tree, "Review Address").onPress(); tree = view.render();
    action(tree, "Save as Home Address").onPress();
    for (const cleanup of harness.cleanups) cleanup();
    finish(); await tick();
    expect(view.onSaved).not.toHaveBeenCalled();
    expect(harness.updateAddress.mock.calls[0][2].signal.aborted).toBe(true);
  });

  it("shows a recoverable offline write error and prevents duplicate save presses", async () => {
    let fail!: (error: unknown) => void;
    harness.updateAddress.mockReturnValue(new Promise<void>((_resolve, reject) => { fail = reject; }));
    const view = screen(saved); let tree = view.render();
    action(tree, "Review Address").onPress(); tree = view.render();
    const save = action(tree, "Save as Home Address"); save.onPress(); save.onPress();
    expect(harness.updateAddress).toHaveBeenCalledTimes(1);
    fail(new ApiNetworkError()); await tick(); tree = view.render();
    expect(textContent(tree)).toContain("Reconnect, check your saved addresses");
    expect(view.onSaved).not.toHaveBeenCalled();
  });
});
