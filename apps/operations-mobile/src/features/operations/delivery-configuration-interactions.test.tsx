import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiNetworkError } from "@restaurant-platform/api-client";
import type { DeliveryZoneResponse } from "@restaurant-platform/shared-types";

type Frame = { values: unknown[]; effects: { dependencies: unknown[]; cleanup?: () => void }[] };
const scenario = vi.hoisted(() => ({ frames: new Map<string, Frame>(), active: "", cursor: 0, role: "OWNER", userId: "owner-a", restaurantId: "restaurant-a",
  zones: vi.fn(), create: vi.fn(), update: vi.fn(), members: vi.fn(), defaultDriver: vi.fn(), setDriver: vi.fn(), reload: vi.fn(), signOut: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!; const index = scenario.cursor++;
    if (!(index in frame.values)) frame.values[index] = typeof initial === "function" ? initial() : initial;
    return [frame.values[index], (next: unknown) => { frame.values[index] = typeof next === "function" ? next(frame.values[index]) : next; }];
  },
  useRef(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!; const index = scenario.cursor++;
    if (!(index in frame.values)) frame.values[index] = { current: initial };
    return frame.values[index];
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const frame = scenario.frames.get(scenario.active)!; const index = scenario.cursor++; const previous = frame.effects[index];
    if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) {
      previous?.cleanup?.(); frame.effects[index] = { dependencies, cleanup: effect() };
    }
  }, useCallback: (callback: unknown) => callback
}));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: { status: "ready", userId: scenario.userId,
  membership: { role: scenario.role, restaurantId: scenario.restaurantId } }, signOut: scenario.signOut,
  assertWorkspaceAccess: (userId: string, role: string) => { if (userId !== scenario.userId || role !== scenario.role) throw new Error("Access changed"); }
}) }));
vi.mock("../../api", () => ({ getOperationsApi: (access: { assertCurrentAccess(): void }) => ({
  listDeliveryZones: (...args: unknown[]) => { access.assertCurrentAccess(); return scenario.zones(...args); },
  createDeliveryZone: (...args: unknown[]) => { access.assertCurrentAccess(); return scenario.create(...args); },
  updateDeliveryZone: (...args: unknown[]) => { access.assertCurrentAccess(); return scenario.update(...args); },
  listDeliveryAssignmentOptions: scenario.members, getDefaultDriver: scenario.defaultDriver,
  setDefaultDriver: (...args: unknown[]) => { access.assertCurrentAccess(); return scenario.setDriver(...args); }
}) }));
vi.mock("../../hooks/useUnsavedChanges", () => ({ useUnsavedChanges: () => undefined, useDraftNavigation: () => ({ requestNavigation: (action: () => void) => action() }) }));
vi.mock("../../components/ui", () => ({ Action: "Action", Badge: "Badge", Body: "Body", Card: "Card", ConfirmDialog: "ConfirmDialog", FormField: "FormField", Status: "Status" }));
vi.mock("../../components/forms", () => ({ FormToggle: "FormToggle", MutationFeedback: "MutationFeedback" }));
vi.mock("../../components/LocationSelector", () => ({ LocationSelector: "LocationSelector" }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
import { DeliveryConfiguration, ZoneEditor } from "./DeliveryConfiguration";

type Element = ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => ReactNode;
function render(component: Component, props: Record<string, unknown> = {}, key = component.name): ReactNode {
  scenario.active = key; scenario.cursor = 0;
  if (!scenario.frames.has(key)) scenario.frames.set(key, { values: [], effects: [] });
  return component(props);
}
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function") return expand(render(node.type as Component, node.props, `${node.type.name}:${node.key ?? ""}`));
  if (node.type === "QueryResult") {
    const state = node.props.state as { status: string; data: unknown };
    return state.status === "ready" ? expand((node.props.children as (data: unknown) => ReactNode)(state.data)) : state.status;
  }
  return { ...node, props: { ...node.props, children: expand(node.props.children as ReactNode) } };
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node) || node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(tree: ReactNode, type: string, label: string) {
  const element = elements(tree).find(item => item.type === type && [item.props.title, item.props.label].includes(label));
  if (!element) throw new Error(`Missing ${type}: ${label}`);
  return element;
}
function press(tree: ReactNode, title: string) { const item = find(tree, "Action", title); if (!item.props.disabled) (item.props.onPress as () => void)(); }
function enter(tree: ReactNode, label: string, value: string) { (find(tree, "FormField", label).props.onChangeText as (text: string) => void)(value); }
function confirm(tree: ReactNode, title: string) { (find(tree, "ConfirmDialog", title).props.onConfirm as () => void)(); }
function allText(tree: ReactNode): string {
  if (Array.isArray(tree)) return tree.map(allText).join(" ");
  if (!isValidElement<Record<string, unknown>>(tree)) return typeof tree === "string" ? tree : "";
  return [tree.props.title, tree.props.label, tree.props.message, tree.props.error, allText(tree.props.children as ReactNode)].filter(Boolean).join(" ");
}
const baseline: DeliveryZoneResponse = { id: "zone-a", restaurantId: "restaurant-a", name: "Original zone", deliveryFee: 1200, minimumOrder: 4500,
  active: true, coverageCity: " Exact legacy city ", coverageTownship: "Legacy township", regionId: null, districtId: null, townshipId: null };
let currentZone: DeliveryZoneResponse | undefined;
const zone = () => expand(render(ZoneEditor as Component, { zone: currentZone, restaurantId: scenario.restaurantId, reload: scenario.reload }));
const configuration = () => expand(render(DeliveryConfiguration));
const settle = async () => { for (let count = 0; count < 20; count++) await Promise.resolve(); };
beforeEach(() => {
  vi.clearAllMocks(); scenario.frames.clear(); scenario.role = "OWNER"; scenario.userId = "owner-a"; scenario.restaurantId = "restaurant-a"; currentZone = baseline;
  scenario.zones.mockResolvedValue([baseline]); scenario.update.mockImplementation((id, body) => Promise.resolve({ ...baseline, ...body, id }));
  scenario.create.mockImplementation(body => Promise.resolve({ ...body, id: "new-zone", restaurantId: scenario.restaurantId }));
  scenario.defaultDriver.mockResolvedValue({ restaurantId: "restaurant-a", defaultDriverUserId: null });
  scenario.members.mockResolvedValue([{ userId: "staff", role: "STAFF", fullName: "Eligible staff" }, { userId: "driver", role: "DELIVERY_DRIVER", fullName: "Eligible driver" }]);
  scenario.setDriver.mockResolvedValue({ restaurantId: "restaurant-a", defaultDriverUserId: "driver" });
});
afterEach(() => { for (const frame of scenario.frames.values()) for (const effect of frame.effects) effect?.cleanup?.(); });

describe("delivery configuration review and reconciliation", () => {
  it.each(["OWNER", "MANAGER"])("allows %s to review before preserving exact legacy coverage during a fee update", async role => {
    scenario.role = role; press(zone(), "Edit zone and coverage"); enter(zone(), "Delivery fee (whole amount)", "1500");
    press(zone(), "Review delivery zone"); expect(scenario.update).not.toHaveBeenCalled();
    expect(find(zone(), "ConfirmDialog", "Review delivery zone").props.message).toContain("Preserve original  Exact legacy city ");
    confirm(zone(), "Review delivery zone"); await settle();
    expect(scenario.update).toHaveBeenCalledExactlyOnceWith("zone-a", { name: "Original zone", deliveryFee: 1500, minimumOrder: 4500, active: true });
    expect(allText(zone())).toContain("Server confirmed the delivery zone");
    expect(scenario.reload).toHaveBeenCalledOnce();
  });
  it("retains unsaved changes after a background server refresh and requires discard confirmation", () => {
    press(zone(), "Edit zone and coverage"); enter(zone(), "Zone name", "Unsaved name");
    currentZone = { ...baseline, deliveryFee: 9999 };
    expect(find(zone(), "FormField", "Zone name").props.value).toBe("Unsaved name");
    expect(allText(zone())).toContain("Your draft was retained");
    expect(find(zone(), "Action", "Review delivery zone").props.disabled).toBe(true);
    press(zone(), "Close zone form"); expect(find(zone(), "ConfirmDialog", "Discard zone changes?")).toBeTruthy();
    (find(zone(), "ConfirmDialog", "Discard zone changes?").props.onCancel as () => void)();
    expect(find(zone(), "FormField", "Zone name").props.value).toBe("Unsaved name");
    press(zone(), "Discard zone changes"); confirm(zone(), "Discard zone changes?");
    press(zone(), "Edit zone and coverage"); expect(find(zone(), "FormField", "Delivery fee (whole amount)").props.value).toBe("9999");
  });
  it("blocks a pending review after its draft changes and blocks a changed server baseline preflight", async () => {
    press(zone(), "Edit zone and coverage"); enter(zone(), "Zone name", "Reviewed name"); press(zone(), "Review delivery zone");
    const callback = find(zone(), "ConfirmDialog", "Review delivery zone").props.onConfirm as () => void;
    enter(zone(), "Zone name", "Changed name"); zone(); callback(); await settle(); expect(scenario.update).not.toHaveBeenCalled();
    press(zone(), "Review delivery zone"); scenario.zones.mockResolvedValueOnce([{ ...baseline, deliveryFee: 6000 }]);
    confirm(zone(), "Review delivery zone"); await settle(); expect(scenario.update).not.toHaveBeenCalled();
    expect(allText(zone())).toContain("Reconcile the zone");
  });
  it("keeps uncertain saves blocked until a successful read and explicit reconciliation", async () => {
    scenario.update.mockRejectedValueOnce(new ApiNetworkError()); press(zone(), "Edit zone and coverage"); enter(zone(), "Delivery fee (whole amount)", "1500");
    press(zone(), "Review delivery zone"); confirm(zone(), "Review delivery zone"); await settle();
    expect(scenario.update).toHaveBeenCalledOnce(); expect(allText(zone())).not.toContain("Server confirmed");
    expect(elements(zone()).some(item => item.props.title === "Review delivery zone")).toBe(false);
    scenario.zones.mockRejectedValueOnce(new ApiNetworkError()); press(zone(), "Refresh zones to reconcile"); await settle();
    expect(elements(zone()).some(item => item.props.title === "I reviewed the zones; load current data")).toBe(false);
    scenario.zones.mockResolvedValueOnce([{ ...baseline, deliveryFee: 1500 }]); press(zone(), "Refresh zones to reconcile"); await settle();
    expect(allText(zone())).toContain("Current server zones"); expect(scenario.update).toHaveBeenCalledOnce();
    press(zone(), "I reviewed the zones; load current data"); expect(find(zone(), "FormField", "Delivery fee (whole amount)").props.value).toBe("1500");
  });
  it("does not create new coverage until active selector validation and rejects incorrect tenant success", async () => {
    currentZone = undefined; press(zone(), "Create delivery zone"); enter(zone(), "Zone name", "New zone");
    expect(find(zone(), "Action", "Review delivery zone").props.disabled).toBe(true);
    const selector = elements(zone()).find(item => item.type === "LocationSelector")!;
    (selector.props.onChange as (value: unknown) => void)({ regionId: "r", districtId: "d", townshipId: "t", regionName: "Region", districtName: "District", township: "Township" });
    (selector.props.onValidityChange as (valid: boolean) => void)(true);
    press(zone(), "Review delivery zone"); scenario.create.mockResolvedValueOnce({ ...baseline, id: "foreign", restaurantId: "restaurant-b", name: "New zone", deliveryFee: 0, minimumOrder: 0 });
    confirm(zone(), "Review delivery zone"); await settle(); expect(allText(zone())).not.toContain("Server confirmed"); expect(allText(zone())).toContain("Reconcile the zone");
  });
  it("cannot issue a write if membership changes during a pending read", async () => {
    let finish!: (zones: DeliveryZoneResponse[]) => void;
    scenario.zones.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    press(zone(), "Edit zone and coverage"); enter(zone(), "Zone name", "Reviewed name"); press(zone(), "Review delivery zone"); confirm(zone(), "Review delivery zone");
    scenario.role = "STAFF"; finish([baseline]); await settle(); expect(scenario.update).not.toHaveBeenCalled();
  });
  it.each(["STAFF", "DELIVERY_DRIVER"])("denies configuration for %s before any settings requests", role => {
    scenario.role = role; expect(configuration()).toBeNull(); expect(scenario.zones).not.toHaveBeenCalled(); expect(scenario.defaultDriver).not.toHaveBeenCalled();
  });
  it("offers only the eligible Delivery Driver default, rechecks eligibility and never manually reassigns tasks", async () => {
    configuration(); await settle(); press(configuration(), "Manage coverage, fees and default driver"); configuration(); await settle();
    const tree = configuration(); expect(allText(tree)).toContain("Set default: Eligible driver"); expect(allText(tree)).not.toContain("Set default: Eligible staff");
    press(tree, "Set default: Eligible driver"); expect(scenario.setDriver).not.toHaveBeenCalled();
    scenario.members.mockResolvedValueOnce([{ userId: "driver", role: "STAFF", fullName: "Role changed" }]);
    confirm(configuration(), "Change default driver"); await settle(); expect(scenario.setDriver).not.toHaveBeenCalled();
    expect(allText(configuration())).toContain("Reload and review the current default");
  });
});
