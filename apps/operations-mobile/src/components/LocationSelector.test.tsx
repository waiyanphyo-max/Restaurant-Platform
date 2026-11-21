import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoLocationDto, LocationSelection } from "@restaurant-platform/shared-types";

const harness = vi.hoisted(() => ({ states: [] as unknown[], effects: [] as { deps: unknown[]; cleanup?: () => void }[], state: 0, effect: 0,
  regions: vi.fn(), districts: vi.fn(), townships: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const i = harness.state++;
    if (!(i in harness.states)) harness.states[i] = typeof initial === "function" ? initial() : initial;
    return [harness.states[i], (value: unknown) => { harness.states[i] = typeof value === "function" ? value(harness.states[i]) : value; }];
  },
  useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
    const i = harness.effect++;
    const previous = harness.effects[i];
    if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
      previous?.cleanup?.(); harness.effects[i] = { deps, cleanup: effect() };
    }
  }
}));
vi.mock("react-native", () => ({ Text: "Text", View: "View" }));
vi.mock("./ui", () => ({ Action: "Action", Body: "Body", FormField: "FormField" }));
vi.mock("../tenant", () => ({ readEmbeddedTenant: () => ({ apiBaseUrl: "https://api.example.test" }) }));
vi.mock("@restaurant-platform/api-client", () => ({ createLocationApiClient: () => ({ getRegions: harness.regions, getDistricts: harness.districts, getTownships: harness.townships }) }));
import { LocationSelector } from "./LocationSelector";

const region = { id: "r", nameEn: "Region", code: "R", nameMy: null };
const district = { id: "d", nameEn: "District", code: "D", nameMy: null, regionId: "r" };
const township = { id: "t", nameEn: "Township", code: "T", nameMy: null, regionId: "r", districtId: "d" };
const initial: LocationSelection = { regionId: "", districtId: "", townshipId: "", regionName: "", districtName: "", township: "" };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function setup(start = initial, onValidityChange?: (valid: boolean) => void) {
  let value = start;
  const onChange = vi.fn((next: LocationSelection) => { value = next; });
  const render = () => { harness.state = 0; harness.effect = 0; return LocationSelector({ value, onChange, onValidityChange }); };
  const choice = (label: string) => elements(render()).find(item => item.props.label === label)!.props as {
    enabled: boolean; list: { loading: boolean; error: boolean; data: GeoLocationDto[]; retry(): void }; onChoose(item: GeoLocationDto): void;
  };
  return { choice, onChange, value: () => value };
}
beforeEach(() => {
  harness.effects.forEach(effect => effect.cleanup?.());
  harness.states = []; harness.effects = []; harness.state = 0; harness.effect = 0;
  harness.regions.mockReset().mockResolvedValue([region]);
  harness.districts.mockReset().mockResolvedValue([district]);
  harness.townships.mockReset().mockResolvedValue([township]);
});
describe("canonical dependent location selection", () => {
  it("reports validity only for currently active records in the same loaded hierarchy", async () => {
    const valid = vi.fn();
    const view = setup({ ...initial, regionId: "r", districtId: "d", townshipId: "t" }, valid);
    view.choice("Township"); expect(valid).toHaveBeenLastCalledWith(false); await tick();
    view.choice("Township"); expect(valid).toHaveBeenLastCalledWith(true);
    view.choice("Region / State").onChoose({ ...region, id: "inactive" });
    view.choice("Township"); await tick(); view.choice("Township");
    expect(valid).toHaveBeenLastCalledWith(false);
  });
  it("does not authorize a stale township or a mismatched parent even if labels still match", async () => {
    harness.townships.mockResolvedValue([{ ...township, regionId: "other-region" }]);
    const valid = vi.fn();
    const view = setup({ ...initial, regionId: "r", districtId: "d", townshipId: "t" }, valid);
    view.choice("Township"); await tick(); view.choice("Township");
    expect(valid).toHaveBeenLastCalledWith(false);
    harness.townships.mockResolvedValue([]);
    view.choice("Township").list.retry(); view.choice("Township"); await tick(); view.choice("Township");
    expect(valid).toHaveBeenLastCalledWith(false);
  });
  it("loads only eligible levels and clears descendants atomically when parents change", async () => {
    const view = setup();
    expect(view.choice("District").enabled).toBe(false);
    expect(view.choice("Township").enabled).toBe(false);
    expect(harness.districts).not.toHaveBeenCalled();
    view.choice("Region / State").onChoose(region); await tick();
    view.choice("District"); await tick();
    expect(harness.districts).toHaveBeenCalledWith("r", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    view.choice("District").onChoose(district);
    view.choice("Township"); await tick();
    view.choice("Township").onChoose(township);
    expect(view.value().townshipId).toBe("t");
    view.choice("District").onChoose({ ...district, id: "d2" });
    expect(view.value()).toMatchObject({ regionId: "r", districtId: "d2", townshipId: "", township: "" });
    view.choice("Region / State").onChoose({ ...region, id: "r2" });
    expect(view.value()).toMatchObject({ regionId: "r2", districtId: "", districtName: "", townshipId: "", township: "" });
  });
  it("does not display a late response from the previous parent", async () => {
    let finish!: (value: GeoLocationDto[]) => void;
    harness.districts.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = setup({ ...initial, regionId: "r" });
    view.choice("District");
    const oldSignal = harness.districts.mock.calls[0][1].signal as AbortSignal;
    view.choice("Region / State").onChoose({ ...region, id: "r2" });
    view.choice("District"); await tick();
    finish([{ ...district, id: "stale" }]); await tick();
    expect(oldSignal.aborted).toBe(true);
    expect(view.choice("District").list.data.some(item => item.id === "stale")).toBe(false);
  });
  it("exposes loading, empty, failure and retry states", async () => {
    harness.regions.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    const view = setup();
    expect(view.choice("Region / State").list.loading).toBe(true); await tick();
    expect(view.choice("Region / State").list.error).toBe(true);
    view.choice("Region / State").list.retry(); view.choice("Region / State"); await tick();
    expect(view.choice("Region / State").list).toMatchObject({ data: [], error: false, loading: false });
    expect(harness.regions).toHaveBeenCalledTimes(2);
  });
  it("searches reference labels without accepting typed geographic text", async () => {
    harness.regions.mockResolvedValue([region, { ...region, id: "r2", nameEn: "Other Region" }]);
    const onChange = vi.fn();
    function root() { harness.state = 0; harness.effect = 0; return LocationSelector({ value: initial, onChange }); }
    root(); await tick();
    const choice = elements(root()).find(item => item.props.label === "Region / State")!;
    harness.states = [];
    function renderChoice() {
      harness.state = 0;
      return (choice.type as (props: Record<string, unknown>) => ReactNode)(choice.props);
    }
    let tree = elements(renderChoice());
    (tree.find(item => item.type === "Action")!.props.onPress as () => void)();
    tree = elements(renderChoice());
    (tree.find(item => item.type === "FormField")!.props.onChangeText as (text: string) => void)("Other");
    tree = elements(renderChoice());
    expect(tree.filter(item => item.type === "Action").map(item => item.props.title)).toEqual(["Region / State: Select", "Other Region"]);
    expect(onChange).not.toHaveBeenCalled();
    (tree.find(item => item.props.title === "Other Region")!.props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ regionId: "r2", districtId: "", townshipId: "" }));
  });
});
