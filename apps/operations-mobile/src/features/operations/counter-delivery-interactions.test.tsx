import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import type { AssignedDeliveryDetailDto, CreateStaffOrderResponse, DeliveryTaskDto, MenuProductDto } from "@restaurant-platform/shared-types";

type Frame = { values: unknown[]; effects: { dependencies: unknown[]; cleanup?: () => void }[] };
const scenario = vi.hoisted(() => ({
  frames: new Map<string, Frame>(), active: "", cursor: 0, role: "STAFF", restaurantId: "00000000-0000-4000-8000-000000000101", userId: "handler",
  options: vi.fn(), menu: vi.fn(), create: vi.fn(), orders: vi.fn(), deliveries: vi.fn(), mine: vi.fn(), delivery: vi.fn(), detail: vi.fn(),
  assignment: vi.fn(), assign: vi.fn(), update: vi.fn(), payments: vi.fn(), collect: vi.fn(), changed: vi.fn(), signOut: vi.fn(), openUrl: vi.fn()
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!;
    const position = scenario.cursor++;
    if (!(position in frame.values)) frame.values[position] = typeof initial === "function" ? initial() : initial;
    return [frame.values[position], (value: unknown) => { frame.values[position] = typeof value === "function" ? value(frame.values[position]) : value; }];
  },
  useRef(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!;
    const position = scenario.cursor++;
    if (!(position in frame.values)) frame.values[position] = { current: initial };
    return frame.values[position];
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const frame = scenario.frames.get(scenario.active)!;
    const position = scenario.cursor++;
    const previous = frame.effects[position];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
      previous?.cleanup?.(); frame.effects[position] = { dependencies, cleanup: effect() };
    }
  },
  useCallback: (callback: unknown) => callback
}));
vi.mock("react-native", () => ({ Linking: { openURL: scenario.openUrl }, View: "View" }));
vi.mock("expo-router", () => ({ Link: "Link", useRouter: () => ({ navigate: vi.fn() }) }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: {
  status: "ready", userId: scenario.userId, membership: { restaurantId: scenario.restaurantId, role: scenario.role }
}, signOut: scenario.signOut }) }));
vi.mock("../../api", () => ({ getOperationsApi: () => ({
  getStaffOrderOptions: scenario.options, getPublicMenu: scenario.menu, createStaffOrder: scenario.create, listOrders: scenario.orders,
  listDeliveries: scenario.deliveries, listMyDeliveries: scenario.mine, getDelivery: scenario.delivery, getMyDelivery: scenario.detail,
  listDeliveryAssignmentOptions: scenario.assignment, assignDriver: scenario.assign, updateDeliveryStatus: scenario.update,
  listOrderPayments: scenario.payments, collectPayment: scenario.collect
}) }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", ConfirmDialog: "ConfirmDialog", FormField: "FormField", Page: "Page", StateView: "StateView" }));
vi.mock("../../components/forms", () => ({ FormToggle: "FormToggle", MutationFeedback: "MutationFeedback", Choices: "Choices" }));
vi.mock("../management/controls", () => ({ Choices: "Choices" }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("../../components/LocationSelector", () => ({ LocationSelector: "LocationSelector" }));
vi.mock("../../hooks/useUnsavedChanges", () => ({ useUnsavedChanges: () => undefined, useDraftNavigation: () => ({ requestNavigation: (action: () => void) => action() }) }));
vi.mock("./CounterProductMedia", () => ({ CounterProductMedia: "CounterProductMedia" }));

import { CounterOrderPanel } from "./CounterOrderPanel";
import { DeliveriesScreen } from "./DeliveriesScreen";
import { DeliveryDetailScreen } from "./DeliveryDetailScreen";

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
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(node: ReactNode, type: string, label: string) {
  const result = elements(node).find(value => value.type === type && [value.props.title, value.props.label].includes(label));
  if (!result) throw new Error(`Missing ${type}: ${label}`);
  return result;
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (!isValidElement<Record<string, unknown>>(node)) return typeof node === "string" || typeof node === "number" ? String(node) : "";
  return [node.props.title, node.props.label, node.props.message, node.props.error, text(node.props.children as ReactNode)].filter(Boolean).join(" ");
}
function press(node: ReactNode, label: string) {
  const element = find(node, "Action", label);
  if (!element.props.disabled) (element.props.onPress as () => void)();
}
function enter(node: ReactNode, label: string, value: string) { (find(node, "FormField", label).props.onChangeText as (value: string) => void)(value); }
const counter = () => expand(render(CounterOrderPanel as Component, { onOrderChanged: scenario.changed }));
const deliveries = () => expand(render(DeliveriesScreen));
const assigned = () => expand(render(DeliveryDetailScreen as Component, { deliveryId: "delivery" }));
const settle = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };
const page = <T,>(content: T[]) => ({ content, number: 0, totalPages: content.length ? 1 : 0, totalElements: content.length, first: true, last: true });
const product: MenuProductDto = { id: "rice", name: "Rice", description: "Current catalog product", price: null, imageUrl: null,
  available: true, trackStock: true, stockQuantity: 5,
  variants: [{ id: "large", name: "Large", price: 3500, imageUrl: null, available: true }],
  modifierGroups: [{ id: "extras", name: "Extras", required: true, minSelections: 1, maxSelections: 1,
    options: [{ id: "egg", name: "Egg", additionalPrice: 500, available: true }] }] };
const receipt: CreateStaffOrderResponse = { orderId: "00000000-0000-4000-8000-000000000201", orderNumber: "SERVER-0042", orderType: "TAKEAWAY", orderChannel: "STAFF",
  status: "PENDING", currency: "MMK", subtotal: 8200, totalAmount: 8200, queueTicketId: "00000000-0000-4000-8000-000000000202", queueNumber: 42, queueDisplayCode: "A042", paymentStatus: "PENDING" };
const task: DeliveryTaskDto = { id: "delivery", orderId: "order", orderNumber: "SERVER-07", orderStatus: "OUT_FOR_DELIVERY", status: "PICKED_UP",
  driverUserId: "handler", customerName: "Private recipient", customerPhone: "555-9876", deliveryAddress: "Private destination", deliveryNote: "Private note",
  totalAmount: 8000, assignedAt: null, pickedUpAt: "2026-11-21T10:00:00Z", deliveredAt: null, failureReason: null,
  createdAt: "2026-11-21T09:00:00Z", updatedAt: "2026-11-21T10:00:00.000001Z" };
const detail: AssignedDeliveryDetailDto = { task, pickup: { name: "Restaurant A", address: "Restaurant pickup", latitude: null, longitude: null },
  destination: { latitude: 17, longitude: 97 }, items: [], cashCollectionRequired: true };

beforeEach(() => {
  vi.clearAllMocks(); scenario.frames.clear(); scenario.role = "STAFF"; scenario.userId = "handler"; scenario.restaurantId = "00000000-0000-4000-8000-000000000101";
  scenario.options.mockResolvedValue({ dineInEnabled: true, takeawayEnabled: true, tables: [{ id: "table", tableLabel: "Actual table" }] });
  scenario.menu.mockResolvedValue({ currency: "MMK", categories: [{ id: "food", products: [product] }] });
  scenario.create.mockResolvedValue(receipt);
  scenario.orders.mockResolvedValue(page([{ id: receipt.orderId, orderNumber: "SERVER-0042", createdAt: "2026-11-21T10:00:00Z", totalAmount: 8200, status: "PENDING" }]));
  scenario.deliveries.mockResolvedValue(page([task])); scenario.mine.mockResolvedValue(page([task]));
  scenario.delivery.mockResolvedValue(task); scenario.detail.mockResolvedValue(detail);
  scenario.payments.mockResolvedValue([{ id: "cod", method: "CASH_ON_DELIVERY", status: "PENDING", amount: 7500 }]);
  scenario.assignment.mockResolvedValue([{ userId: "staff-assignee", role: "STAFF", fullName: "Eligible staff" }, { userId: "driver", role: "DELIVERY_DRIVER", fullName: "Eligible driver" }]);
  scenario.assign.mockResolvedValue(task); scenario.update.mockResolvedValue(task); scenario.signOut.mockResolvedValue(undefined);
});
afterEach(() => { for (const frame of scenario.frames.values()) for (const effect of frame.effects) effect?.cleanup?.(); });

async function basket() {
  press(counter(), "Create counter order"); await settle(); counter(); await settle();
  const service = find(counter(), "Choices", "Service mode · ဝန်ဆောင်မှုပုံစံ");
  (service.props.onChange as (value: string) => void)("TAKEAWAY");
  press(counter(), "Choose Rice");
  press(counter(), "Large · 3,500 MMK");
  enter(counter(), "Item quantity · အရေအတွက်", "2");
  press(counter(), "Egg · +500 MMK");
  enter(counter(), "Egg quantity per item", "3");
  enter(counter(), "Kitchen instruction (optional) · မီးဖိုချောင်မှတ်ချက်", "Pack separately\nNo onions");
  press(counter(), "Add item");
}
function review() { press(counter(), "Review counter order"); }
function confirmCounter() { (find(counter(), "ConfirmDialog", "Review counter order · ကောင်တာအော်ဒါ စစ်ဆေးရန်").props.onConfirm as () => void)(); }

describe("counter review, server receipt and manual reconciliation", () => {
  it.each(["OWNER", "MANAGER", "STAFF"])("lets %s review real choices then create only a pending counter order", async role => {
    scenario.role = role; await basket(); review();
    const confirmation = find(counter(), "ConfirmDialog", "Review counter order · ကောင်တာအော်ဒါ စစ်ဆေးရန်");
    expect(confirmation.props.message).toContain("2 × Rice · Large · Egg × 3");
    expect(confirmation.props.message).toContain("Pack separately\nNo onions");
    expect(confirmation.props.message).toContain("10,000 MMK"); expect(confirmation.props.message).toContain("Payment remains pending");
    expect(scenario.create).not.toHaveBeenCalled(); confirmCounter(); await settle();
    expect(scenario.create).toHaveBeenCalledExactlyOnceWith({ orderType: "TAKEAWAY", tableId: null, note: null,
      items: [{ productId: "rice", variantId: "large", quantity: 2, modifiers: [{ modifierOptionId: "egg", quantity: 3 }], specialInstruction: "Pack separately\nNo onions" }] });
    expect(text(counter())).toContain("SERVER-0042 created"); expect(text(counter())).toContain("A042"); expect(text(counter())).toMatch(/8,200\s+MMK/);
    expect(scenario.collect).not.toHaveBeenCalled();
  });
  it("does not mount counter queries for a Driver and discards the draft across restaurant scopes", async () => {
    scenario.role = "DELIVERY_DRIVER"; expect(counter()).toBeNull(); expect(scenario.options).not.toHaveBeenCalled();
    scenario.role = "STAFF"; await basket(); expect(text(counter())).toContain("Rice × 2");
    scenario.restaurantId = "00000000-0000-4000-8000-000000000102";
    expect(text(counter())).not.toContain("Rice × 2"); expect(text(counter())).not.toContain("SERVER-0042");
  });
  it("does not invent a pickup queue when the server returned no queue", async () => {
    scenario.create.mockResolvedValueOnce({ ...receipt, queueTicketId: null, queueNumber: null, queueDisplayCode: null });
    await basket(); review(); confirmCounter(); await settle();
    expect(text(counter())).toContain("SERVER-0042 created"); expect(text(counter())).not.toContain("Pickup code");
  });
  it.each([{}, null, { ...receipt, status: null }, { ...receipt, paymentStatus: "PAID" }, { ...receipt, orderType: "DINE_IN" }, { ...receipt, queueNumber: null }])(
    "preserves the basket and requires reconciliation for malformed successful JSON %j", async malformed => {
      scenario.create.mockResolvedValueOnce(malformed); await basket(); review(); confirmCounter(); await settle();
      const tree = counter();
      expect(text(tree)).toContain("may have reached the restaurant"); expect(text(tree)).toContain("Rice × 2");
      expect(text(tree)).not.toContain("Counter order received"); expect(text(tree)).not.toContain("Saved successfully");
      expect(find(tree, "Action", "Review counter order").props.disabled).toBe(true);
      expect(find(tree, "Action", "I checked Orders. Allow a new submission").props.disabled).toBe(true);
      expect(scenario.create).toHaveBeenCalledOnce(); expect(scenario.collect).not.toHaveBeenCalled();
    }
  );
  it("requires successful authorized Orders refresh and manual acknowledgement after a lost creation response", async () => {
    scenario.create.mockRejectedValueOnce(new ApiNetworkError()); await basket(); review(); confirmCounter(); await settle();
    expect(text(counter())).toContain("may have reached the restaurant"); expect(text(counter())).not.toContain("SERVER-0042 created");
    const acknowledge = "I checked Orders. Allow a new submission";
    expect(find(counter(), "Action", acknowledge).props.disabled).toBe(true);
    press(counter(), acknowledge); expect(scenario.create).toHaveBeenCalledOnce();
    press(counter(), "Refresh orders to check the submission"); counter(); await settle();
    expect(text(counter())).toContain("SERVER-0042"); expect(text(counter())).toContain("cannot prove");
    expect(scenario.orders).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 20 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(scenario.create).toHaveBeenCalledOnce(); press(counter(), acknowledge);
    review(); expect(scenario.create).toHaveBeenCalledOnce();
  });
  it("keeps another submission blocked if the reconciliation read fails", async () => {
    scenario.create.mockRejectedValueOnce(new ApiNetworkError()); scenario.orders.mockRejectedValueOnce(new ApiNetworkError());
    await basket(); review(); confirmCounter(); await settle(); press(counter(), "Refresh orders to check the submission"); counter(); await settle();
    expect(find(counter(), "Action", "I checked Orders. Allow a new submission").props.disabled).toBe(true);
    expect(scenario.create).toHaveBeenCalledOnce();
  });
  it("gates rapid confirmation taps and confirms discard before clearing a basket", async () => {
    await basket(); press(counter(), "Discard counter draft");
    const discard = find(counter(), "ConfirmDialog", "Discard counter draft?");
    (discard.props.onCancel as () => void)(); expect(text(counter())).toContain("Rice × 2");
    let finish!: (value: CreateStaffOrderResponse) => void;
    scenario.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    review(); const confirm = find(counter(), "ConfirmDialog", "Review counter order · ကောင်တာအော်ဒါ စစ်ဆေးရန်").props.onConfirm as () => void;
    confirm(); confirm(); expect(scenario.create).toHaveBeenCalledOnce(); finish(receipt); await settle(); expect(scenario.collect).not.toHaveBeenCalled();
  });
});

describe("delivery scope, revisions and physical cash", () => {
  it.each(["STAFF", "DELIVERY_DRIVER"])("uses assigned summaries for %s and strips private fields and unexpected assignees", async role => {
    scenario.role = role; scenario.mine.mockResolvedValueOnce(page([task, { ...task, id: "foreign", driverUserId: "someone-else", orderNumber: "FOREIGN" }]));
    deliveries(); await settle();
    const tree = deliveries(); expect(text(tree)).toContain("SERVER-07"); expect(text(tree)).not.toContain("FOREIGN");
    expect(text(tree)).not.toContain("Private destination"); expect(text(tree)).not.toContain("555-9876"); expect(scenario.deliveries).not.toHaveBeenCalled();
  });
  it("lets management assign an eligible Staff member using the reviewed revision", async () => {
    scenario.role = "MANAGER"; scenario.deliveries.mockResolvedValueOnce(page([{ ...task, status: "WAITING_ASSIGNMENT", orderStatus: "READY", driverUserId: null }]));
    scenario.delivery.mockResolvedValueOnce({ ...task, status: "WAITING_ASSIGNMENT", orderStatus: "READY", driverUserId: null });
    deliveries(); await settle(); press(deliveries(), "Delivery details and actions"); deliveries(); await settle();
    press(deliveries(), "Eligible staff · STAFF"); press(deliveries(), "Assign / reassign member");
    (find(deliveries(), "ConfirmDialog", "Confirm delivery action").props.onConfirm as () => void)(); await settle();
    expect(scenario.assign).toHaveBeenCalledExactlyOnceWith("delivery", { driverUserId: "staff-assignee", expectedUpdatedAt: task.updatedAt });
  });
  it("requires actual pending COD amount and explicit cash acknowledgement for management delivery", async () => {
    scenario.role = "OWNER"; deliveries(); await settle(); press(deliveries(), "Delivery details and actions"); deliveries(); await settle();
    expect(text(deliveries())).toContain("Cash due 7,500");
    expect(find(deliveries(), "Action", "Mark delivered").props.disabled).toBe(true);
    (find(deliveries(), "FormToggle", "I physically collected any cash due on delivery").props.onChange as (value: boolean) => void)(true);
    press(deliveries(), "Mark delivered");
    const confirm = find(deliveries(), "ConfirmDialog", "Confirm delivery action").props.onConfirm as () => void;
    confirm(); confirm(); await settle();
    expect(scenario.update).toHaveBeenCalledExactlyOnceWith("delivery", { status: "DELIVERED", cashCollected: true, note: null, failureReason: null, expectedUpdatedAt: task.updatedAt });
    expect(scenario.collect).not.toHaveBeenCalled();
  });
  it("does not write a delivery update after its revision changed", async () => {
    scenario.role = "MANAGER"; scenario.delivery.mockResolvedValueOnce({ ...task, updatedAt: "2026-11-21T10:00:00.000002Z" });
    deliveries(); await settle(); press(deliveries(), "Delivery details and actions"); deliveries(); await settle();
    (find(deliveries(), "FormToggle", "I physically collected any cash due on delivery").props.onChange as (value: boolean) => void)(true);
    press(deliveries(), "Mark delivered"); (find(deliveries(), "ConfirmDialog", "Confirm delivery action").props.onConfirm as () => void)(); await settle();
    expect(scenario.update).not.toHaveBeenCalled(); expect(scenario.collect).not.toHaveBeenCalled();
  });
  it.each([new ApiHttpError(404, "DELIVERY_NOT_FOUND"), { ...detail, task: { ...task, driverUserId: "new-assignee" } }])(
    "drops revoked assignment data before a navigation or status action", async revoked => {
      scenario.role = "DELIVERY_DRIVER"; assigned(); await settle();
      expect(text(assigned())).toContain("Private destination");
      if (revoked instanceof Error) scenario.detail.mockRejectedValue(revoked); else scenario.detail.mockResolvedValue(revoked);
      press(assigned(), "Navigate to Customer"); await settle(); assigned(); await settle();
      expect(text(assigned())).not.toContain("Private destination"); expect(text(assigned())).not.toContain("555-9876");
      expect(scenario.openUrl).not.toHaveBeenCalled(); expect(scenario.update).not.toHaveBeenCalled();
    }
  );
});
