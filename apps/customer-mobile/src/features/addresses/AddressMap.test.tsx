import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], cleanups: [] as (() => void)[],
  stateIndex: 0, refIndex: 0, effectIndex: 0,
  tenant: { initialMapRegion: undefined as undefined | { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } }
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useRef(initial: unknown) {
    const index = harness.refIndex++;
    harness.refs[index] ??= { current: initial }; return harness.refs[index];
  },
  useEffect(effect: () => (() => void) | void) {
    const index = harness.effectIndex++;
    if (!(index in harness.cleanups)) harness.cleanups[index] = effect() ?? (() => {});
  }
}));
vi.mock("react-native", () => ({ ActivityIndicator: "ActivityIndicator", Modal: "Modal", Text: "Text", View: "View", StyleSheet: { create: (value: unknown) => value, absoluteFillObject: {} } }));
vi.mock("react-native-maps", () => ({ default: "MapView", Marker: "Marker", PROVIDER_GOOGLE: "google" }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body" }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => harness.tenant }));

import { AddressMap } from "./AddressMap";
import { emptyPin, selectPin, type PinSelection } from "./location";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function element(tree: ReactNode, type: string, title?: string) {
  const found = elements(tree).find(item => item.type === type && (!title || item.props.title === title));
  if (!found) throw new Error(`${type} missing`);
  return found.props;
}
function textContent(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (isValidElement<Record<string, unknown>>(node)) return textContent(node.props.children as ReactNode);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

describe("Google map interaction wiring", () => {
  beforeEach(() => {
    harness.states = []; harness.refs = []; harness.cleanups = []; harness.tenant.initialMapRegion = undefined;
    vi.useFakeTimers();
  });
  afterEach(() => { for (const cleanup of harness.cleanups) cleanup(); vi.useRealTimers(); });

  function screen(selection: PinSelection = emptyPin) {
    const callbacks = { onSelect: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn(), onLocate: vi.fn() };
    const render = () => {
      harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
      return AddressMap({ selection, locating: false, notice: null, ...callbacks });
    };
    return { render, ...callbacks };
  }

  it("uses Google provider without requesting or displaying device position", () => {
    const view = screen(); const tree = view.render(); const map = element(tree, "MapView");
    expect(map.provider).toBe("google");
    expect(map.showsUserLocation).toBe(false);
    expect(map.showsMyLocationButton).toBe(false);
    expect(view.onLocate).not.toHaveBeenCalled();
    expect(element(tree, "Action", "Confirm This Location").disabled).toBe(true);
    expect(textContent(tree)).toContain("approximate Yangon region");
  });

  it("passes explicit taps and marker drags to location selection", () => {
    const view = screen(selectPin({ latitude: 16.8, longitude: 96.1 }, "map"));
    const tree = view.render();
    const onPress = element(tree, "MapView").onPress as (event: unknown) => void;
    const marker = element(tree, "Marker"); const onDragEnd = marker.onDragEnd as (event: unknown) => void;
    expect(marker.draggable).toBe(true);
    onPress({ nativeEvent: { coordinate: { latitude: 17, longitude: 97 } } });
    onDragEnd({ nativeEvent: { coordinate: { latitude: 18, longitude: 98 } } });
    expect(view.onSelect.mock.calls).toEqual([[{ latitude: 17, longitude: 97 }], [{ latitude: 18, longitude: 98 }]]);
    expect(view.onConfirm).not.toHaveBeenCalled();
  });

  it("enables confirmation after the native map loads and the customer chooses a pin", () => {
    const view = screen(selectPin({ latitude: 16.8, longitude: 96.1 }, "map"));
    let tree = view.render(); expect(element(tree, "Action", "Confirm This Location").disabled).toBe(true);
    (element(tree, "MapView").onMapLoaded as () => void)(); tree = view.render();
    const confirm = element(tree, "Action", "Confirm This Location");
    expect(confirm.disabled).toBe(false); (confirm.onPress as () => void)();
    expect(view.onConfirm).toHaveBeenCalledTimes(1);
    expect(textContent(tree)).toContain("16.8000000");
    expect(textContent(tree)).toContain("96.1000000");
  });

  it("shows slow map recovery and keeps the manual-entry return available", async () => {
    const view = screen(); view.render(); await vi.advanceTimersByTimeAsync(12_001);
    const tree = view.render(); expect(textContent(tree)).toContain("Google Maps has not loaded");
    (element(tree, "Action", "Return to Address Details").onPress as () => void)();
    expect(view.onCancel).toHaveBeenCalledTimes(1);
    expect(textContent(tree)).toContain("If the map is blank");
  });

  it("uses restaurant build coordinates as an initial view, never as a confirmed pin", () => {
    harness.tenant.initialMapRegion = { latitude: 20, longitude: 90, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    const tree = screen().render();
    expect(element(tree, "MapView").initialRegion).toEqual(harness.tenant.initialMapRegion);
    expect(elements(tree).some(item => item.type === "Marker")).toBe(false);
    expect(element(tree, "Action", "Confirm This Location").disabled).toBe(true);
  });
});
