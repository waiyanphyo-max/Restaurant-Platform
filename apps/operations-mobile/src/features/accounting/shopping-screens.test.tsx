import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingItem, ShoppingSheet } from "@restaurant-platform/shared-types";
import { ApiNetworkError } from "@restaurant-platform/api-client";

const scenario = vi.hoisted(() => ({
  frames: new Map<string, unknown[]>(), active: "", index: 0,
  records: {} as Record<string, unknown>, reload: vi.fn(), run: vi.fn(), reset: vi.fn(),
  createSheet: vi.fn(), updateSheet: vi.fn(), createItem: vi.fn(), updateItem: vi.fn(),
  confirmPurchase: vi.fn(), payment: vi.fn(), load: vi.fn(), begin: vi.fn(), complete: vi.fn(), reject: vi.fn()
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const frame = scenario.frames.get(scenario.active) ?? [];
    scenario.frames.set(scenario.active, frame);
    const index = scenario.index++;
    if (!(index in frame)) frame[index] = typeof initial === "function" ? initial() : initial;
    return [frame[index], (value: unknown) => { frame[index] = typeof value === "function" ? value(frame[index]) : value; }];
  },
  useMemo(create: () => unknown, dependencies: unknown[]) {
    const frame = scenario.frames.get(scenario.active)!;
    const index = scenario.index++;
    const previous = frame[index] as { dependencies: unknown[]; value: unknown } | undefined;
    if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) frame[index] = { dependencies, value: create() };
    return (frame[index] as { value: unknown }).value;
  },
  useEffect(effect: () => unknown, dependencies: unknown[]) {
    const frame = scenario.frames.get(scenario.active)!;
    const index = scenario.index++;
    const previous = frame[index] as { dependencies: unknown[] } | undefined;
    if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) {
      frame[index] = { dependencies }; effect();
    }
  }
}));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: { status: "ready", userId: "00000000-0000-4000-8000-000000000010" } }) }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ environment: "development", restaurantId: "00000000-0000-4000-8000-000000000001" }) }));
vi.mock("./purchase-attempt-native", () => ({ createNativePurchaseAttemptStore: () => ({
  load: scenario.load, begin: scenario.begin, complete: scenario.complete, reject: scenario.reject
}) }));
vi.mock("react-native", () => ({
  View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", StyleSheet: { create: (value: unknown) => value }
}));
vi.mock("../../api", () => ({ getOperationsApi: () => ({
  createShoppingSheet: scenario.createSheet, updateShoppingSheet: scenario.updateSheet,
  createShoppingItem: scenario.createItem, updateShoppingItem: scenario.updateItem,
  confirmPurchase: scenario.confirmPurchase, recordPurchasePayment: scenario.payment
}) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => ({
  state: { status: "ready", data: scenario.records[Object.keys(scenario.records).find(prefix => key.includes(prefix)) ?? ""] }, reload: scenario.reload
}) }));
vi.mock("../../hooks/useApiMutation", () => ({ useApiMutation: () => ({
  busy: false, error: null, message: null, run: scenario.run, reset: scenario.reset
}) }));
vi.mock("../../hooks/useUnsavedChanges", () => ({ useUnsavedChanges: vi.fn() }));
vi.mock("../../components/ui", () => ({
  Page: "Page", Card: "Card", Body: "Body", Action: "Action", FormField: "FormField", ConfirmDialog: "ConfirmDialog"
}));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("../../components/forms", () => ({ FormToggle: "FormToggle", MutationFeedback: "MutationFeedback" }));
vi.mock("../management/controls", () => ({ Choices: "Choices" }));
vi.mock("./FinancialPagination", () => ({ FinancialPagination: "FinancialPagination" }));
vi.mock("./PurchaseScreens", () => ({ PurchaseHistory: "PurchaseHistory", PurchaseDetailScreen: "PurchaseDetailScreen" }));
vi.mock("./SupplierScreens", () => ({ SupplierPicker: "SupplierPicker", SupplierRegister: "SupplierRegister", Payables: "Payables" }));
vi.mock("./AccountingAuditScreen", () => ({ AccountingAuditScreen: "AccountingAuditScreen" }));

import { DailyShoppingPlanner, ShoppingCatalog, ShoppingScreen } from "./ShoppingScreen";
import { PurchasingScreen } from "./PurchasingScreen";
import { FinancialRequestKeys } from "./financial-requests";

type Element = ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => ReactNode;
function render(component: Component, props: Record<string, unknown> = {}, name = component.name): ReactNode {
  scenario.active = name; scenario.index = 0;
  return component(props);
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === "ConfirmDialog" && !node.props.visible) return [];
  if (node.type === "QueryResult") {
    const state = node.props.state as { data: unknown };
    return [node, ...elements((node.props.children as (data: unknown) => ReactNode)(state.data))];
  }
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(node: ReactNode, type: string, label: string): Element {
  const result = elements(node).find(element => element.type === type &&
    [element.props.title, element.props.label, element.props.accessibilityLabel].includes(label));
  if (!result) throw new Error(`Missing ${type}: ${label}`);
  return result;
}
function press(node: ReactNode, label: string) { (find(node, "Action", label).props.onPress as () => void)(); }
function enter(node: ReactNode, type: string, label: string, value: string) {
  (find(node, type, label).props.onChangeText as (value: string) => void)(value);
}
function text(node: ReactNode): string {
  return elements(node).flatMap(element => [element.props.title, element.props.label, element.props.accessibilityLabel,
    typeof element.props.children === "string" ? element.props.children : ""]).filter(value => typeof value === "string").join(" ");
}
const requests = () => new FinancialRequestKeys(() => "test-idempotency-key");
const planner = () => render(DailyShoppingPlanner as Component, { timezone: "Asia/Yangon", requests: requests() });
const catalog = () => render(ShoppingCatalog as Component, { requests: requests() });
function recorder() {
  const screen = render(PurchasingScreen);
  const node = elements(screen).find(element => typeof element.type === "function" && element.type.name === "ViewDraft")!;
  const record = node.props.children as Element;
  return render(record.type as Component, record.props, "PurchaseRecorder");
}
const item: ShoppingItem = {
  id: "rice", name: "Rice ဆန်", defaultUnit: "kg", defaultQuantity: "999", supplierId: "legacy-supplier",
  suggestionEnabled: true, latestUnitCost: "999999", latestCostUnit: "kg", lastConfirmedPurchaseDate: "2026-11-14", suggested: true,
  createdBy: "member", createdAt: "2026-11-14T00:00:00Z", updatedBy: "member", updatedAt: "2026-11-14T00:00:00Z"
};
const previous: ShoppingSheet = {
  id: "monday", shoppingDate: "2026-11-09", status: "PLANNED", paymentStatus: "UNPAID", purchaseId: null,
  lines: [{ id: "line", itemId: item.id, itemName: item.name, quantity: "5", unit: "kg" }],
  createdBy: "member", createdAt: "2026-11-09T00:00:00Z", updatedBy: "member", updatedAt: "2026-11-09T00:00:00Z"
};
const page = (content: unknown[]) => ({ content, page: 0, size: 20, totalElements: content.length });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function selectPlannerItem() {
  press(planner(), "Add Item");
  const picker = elements(planner()).find(element => element.type === ShoppingCatalog)!;
  (picker.props.onSelect as (value: ShoppingItem) => void)(item);
}
function selectPurchasedItem() {
  const picker = elements(recorder()).find(element => element.type === ShoppingCatalog)!;
  (picker.props.onSelect as (value: ShoppingItem) => void)(item);
}

describe("separate shopping planning and purchasing screens", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); scenario.frames.clear();
    scenario.records = { "shopping-settings": { timezone: "Asia/Yangon" }, "purchasing-settings": { timezone: "Asia/Yangon", currency: "MMK" },
      "shopping-sheets": page([previous]), "purchase-source-sheets": page([previous]), "shopping-items": page([item]) };
    scenario.run.mockImplementation(async (action: () => Promise<unknown>, done: (value: unknown) => void) => {
      try { done(await action()); } catch { /* useApiMutation presents errors while the parent retains recovery state. */ }
    });
    scenario.createSheet.mockImplementation(async body => ({ ...previous, ...body, id: "new-sheet" }));
    scenario.updateSheet.mockImplementation(async (_id, body) => ({ ...previous, ...body }));
    scenario.createItem.mockResolvedValue(item); scenario.updateItem.mockResolvedValue(item);
    scenario.confirmPurchase.mockReset().mockResolvedValue({ purchase: { id: "purchase" } });
    scenario.load.mockReset().mockResolvedValue(null);
    scenario.begin.mockReset().mockImplementation(async (body, key) => ({ version: 1, key, body: JSON.parse(JSON.stringify(body)) }));
    scenario.complete.mockReset().mockResolvedValue(undefined); scenario.reject.mockReset().mockResolvedValue(false);
    render(PurchasingScreen); await tick();
  });

  it("starts a daily sheet empty, displays labelled planning controls and never imports catalog quantities or costs", () => {
    const empty = planner();
    expect(text(empty)).toContain("No items selected.");
    expect(find(empty, "Action", "Save Shopping Sheet").props.disabled).toBe(true);
    expect(text(empty)).toContain("Quantity plan only");
    selectPlannerItem();
    const row = planner();
    expect(find(row, "FormField", `Quantity for ${item.name}`).props).toMatchObject({ value: "", keyboardType: "decimal-pad", selectTextOnFocus: true });
    expect(find(row, "FormField", `Unit for ${item.name}`).props.value).toBe("kg");
    expect(text(row)).not.toMatch(/unit cost|unit price|line total|grand total|supplier|invoice|payment|confirm purchase/i);
    expect(scenario.createSheet).not.toHaveBeenCalled(); expect(scenario.confirmPurchase).not.toHaveBeenCalled();
  });

  it("saves only selected item, decimal quantity and unit, rejects duplicates and never creates a financial event", async () => {
    selectPlannerItem();
    let node = planner();
    const picker = elements(node).find(element => element.type === ShoppingCatalog)!;
    (picker.props.onSelect as (value: ShoppingItem) => void)(item);
    expect(elements(planner()).filter(element => element.type === "FormField" && element.props.keyboardType === "decimal-pad")).toHaveLength(1);
    enter(planner(), "FormField", `Quantity for ${item.name}`, "1.5");
    enter(planner(), "FormField", `Unit for ${item.name}`, " kg ");
    enter(planner(), "FormField", "Shopping date (YYYY-MM-DD)", "2026-11-15");
    node = planner(); press(node, "Save Shopping Sheet"); await tick();
    expect(scenario.createSheet).toHaveBeenCalledExactlyOnceWith({ shoppingDate: "2026-11-15", reason: undefined,
      lines: [{ itemId: "rice", quantity: "1.5", unit: "kg" }] }, "test-idempotency-key");
    expect(scenario.confirmPurchase).not.toHaveBeenCalled(); expect(scenario.payment).not.toHaveBeenCalled();
  });

  it("requires positive daily quantities and supports removing rows before saving", () => {
    selectPlannerItem(); enter(planner(), "FormField", `Quantity for ${item.name}`, "0");
    press(planner(), "Save Shopping Sheet");
    expect(elements(planner()).find(element => element.type === "MutationFeedback")?.props.error).toContain("positive");
    expect(scenario.createSheet).not.toHaveBeenCalled();
    press(planner(), `Remove ${item.name}`);
    expect(find(planner(), "Action", "Save Shopping Sheet").props.disabled).toBe(true);
  });

  it("copies a saved sheet into an independent draft with a different daily quantity and no update of the original", async () => {
    press(planner(), "Copy Previous Sheet");
    expect(find(planner(), "FormField", `Quantity for ${item.name}`).props.value).toBe("5");
    enter(planner(), "FormField", `Quantity for ${item.name}`, "2");
    enter(planner(), "FormField", "Shopping date (YYYY-MM-DD)", "2026-11-15");
    press(planner(), "Save Shopping Sheet"); await tick();
    expect(scenario.createSheet.mock.calls[0][0].lines[0].quantity).toBe("2");
    expect(previous.lines[0].quantity).toBe("5"); expect(scenario.updateSheet).not.toHaveBeenCalled();
    expect(scenario.confirmPurchase).not.toHaveBeenCalled();
  });

  it("reopens a plan, requires an audit reason and updates that plan independently", async () => {
    press(planner(), "Open Previous Sheet");
    expect(find(planner(), "FormField", "Shopping date (YYYY-MM-DD)").props.value).toBe("2026-11-09");
    enter(planner(), "FormField", `Quantity for ${item.name}`, "4");
    press(planner(), "Save Shopping Sheet");
    expect(scenario.updateSheet).not.toHaveBeenCalled();
    enter(planner(), "FormField", "Plan correction reason", "Dinner forecast changed");
    press(planner(), "Save Shopping Sheet"); await tick();
    expect(scenario.updateSheet).toHaveBeenCalledExactlyOnceWith("monday", { shoppingDate: "2026-11-09", reason: "Dinner forecast changed",
      lines: [{ itemId: "rice", quantity: "4", unit: "kg" }] }, "test-idempotency-key");
    expect(scenario.createSheet).not.toHaveBeenCalled(); expect(previous.lines[0].quantity).toBe("5");
  });

  it("keeps catalog search and editing without daily quantities, costs, supplier or invoice fields", () => {
    const node = catalog();
    expect(find(node, "FormField", "Find a shopping item by name")).toBeDefined();
    expect(find(node, "Action", `Edit ${item.name}`)).toBeDefined();
    expect(text(node)).not.toMatch(/999999|999|unit cost|unit price|line total|grand total|supplier|invoice|payment/i);
    press(node, "Create catalog item");
    const form = catalog() as Element;
    const fields = render(form.type as Component, form.props, "CatalogItemForm");
    expect(elements(fields).filter(element => element.type === "FormField").map(element => element.props.label)).toEqual(["Item name", "Default unit (optional)"]);
    expect(text(fields)).not.toMatch(/quantity|cost|price|supplier|invoice|payment|purchase/i);
  });

  it("exposes only the catalog and daily-sheet workspaces under Shopping", () => {
    const navigation = find(render(ShoppingScreen), "Choices", "Shopping workspace");
    expect(Object.values(navigation.props.labels as Record<string, string>)).toEqual(["Daily Shopping Sheets", "Shopping Item Catalog"]);
    (navigation.props.onChange as (value: string) => void)("CATALOG");
    expect(elements(render(ShoppingScreen)).some(element => element.type === ShoppingCatalog)).toBe(true);
  });

  it("keeps financial navigation in Purchasing and requires actual quantity/cost before explicit purchase confirmation", async () => {
    const screen = render(PurchasingScreen);
    const navigation = find(screen, "Choices", "Purchasing workspace");
    expect(Object.values(navigation.props.labels as Record<string, string>)).toEqual(["Record Purchase", "Purchase History", "Payments", "Suppliers", "Payables", "Audit History"]);
    for (const [workspace, target] of [["HISTORY", "PurchaseHistory"], ["PAYMENTS", "PurchaseHistory"], ["SUPPLIERS", "SupplierRegister"], ["PAYABLES", "Payables"], ["AUDIT", "AccountingAuditScreen"]]) {
      (find(render(PurchasingScreen), "Choices", "Purchasing workspace").props.onChange as (value: string) => void)(workspace);
      expect(elements(render(PurchasingScreen)).some(element => element.type === target)).toBe(true);
    }
    (find(render(PurchasingScreen), "Choices", "Purchasing workspace").props.onChange as (value: string) => void)("RECORD");
    selectPurchasedItem();
    expect(find(recorder(), "FormField", `Actual cost per unit for ${item.name}`).props.value).toBe("");
    enter(recorder(), "FormField", `Actual quantity for ${item.name}`, "2");
    press(recorder(), "Review actual purchase…");
    expect(elements(recorder()).find(element => element.type === "MutationFeedback")?.props.error).toContain("actual unit cost");
    expect(scenario.confirmPurchase).not.toHaveBeenCalled();
    enter(recorder(), "FormField", `Actual cost per unit for ${item.name}`, "1500");
    press(recorder(), "Review actual purchase…");
    expect(scenario.confirmPurchase).not.toHaveBeenCalled();
    const dialog = find(recorder(), "ConfirmDialog", "Confirm actual purchase");
    (dialog.props.onConfirm as () => void)(); await tick();
    expect(scenario.confirmPurchase).toHaveBeenCalledOnce();
    expect(scenario.confirmPurchase.mock.calls[0][0]).toMatchObject({ lines: [{ itemId: "rice", quantity: "2", unit: "kg", unitCost: "1500" }] });
    expect(scenario.confirmPurchase.mock.calls[0][0].sheetId).toBeUndefined();
    expect(scenario.createSheet).not.toHaveBeenCalled(); expect(scenario.payment).not.toHaveBeenCalled();
  });

  it("copies a selected plan only after confirmation, requires actual costs and permits an actual quantity different from the plan", async () => {
    press(recorder(), "Choose a saved shopping sheet…");
    const source = elements(recorder()).find(element => typeof element.type === "function" && element.type.name === "PurchaseSourceSheets")!;
    const sourceView = render(source.type as Component, source.props, "PurchaseSourceSheets");
    press(sourceView, "Copy 2026-11-09 sheet · 1 items");
    expect(elements(recorder()).some(element => element.props.label === `Actual quantity for ${item.name}`)).toBe(false);
    const copyDialog = find(recorder(), "ConfirmDialog", "Copy plan into purchase draft");
    (copyDialog.props.onConfirm as () => void)();
    expect(find(recorder(), "FormField", `Actual quantity for ${item.name}`).props.value).toBe("5");
    expect(find(recorder(), "FormField", `Actual cost per unit for ${item.name}`).props.value).toBe("");
    expect(scenario.confirmPurchase).not.toHaveBeenCalled(); expect(scenario.updateSheet).not.toHaveBeenCalled();
    enter(recorder(), "FormField", `Actual quantity for ${item.name}`, "3");
    enter(recorder(), "FormField", `Actual cost per unit for ${item.name}`, "1500");
    press(recorder(), "Review actual purchase…");
    const purchaseDialog = find(recorder(), "ConfirmDialog", "Confirm actual purchase");
    (purchaseDialog.props.onConfirm as () => void)(); await tick();
    expect(scenario.confirmPurchase.mock.calls[0][0]).toMatchObject({ sheetId: "monday", lines: [{ itemId: "rice", quantity: "3", unit: "kg", unitCost: "1500" }] });
    expect(previous.lines[0].quantity).toBe("5"); expect(scenario.updateSheet).not.toHaveBeenCalled(); expect(scenario.payment).not.toHaveBeenCalled();
  });

  it("shows exact derived draft totals and exposes non-whole totals without silently rounding", () => {
    selectPurchasedItem();
    const lineTotal = () => {
      const node = elements(recorder()).find(element => typeof element.type === "function" && element.type.name === "PurchaseDraftLineTotal")!;
      return render(node.type as Component, node.props, "PurchaseDraftLineTotal");
    };
    expect(text(lineTotal())).toContain("unavailable");
    enter(recorder(), "FormField", `Actual quantity for ${item.name}`, "1");
    enter(recorder(), "FormField", `Actual cost per unit for ${item.name}`, "9007199254740993");
    expect(elements(lineTotal()).flatMap(element => element.props.children as unknown[])).toContain("9,007,199,254,740,993");
    enter(recorder(), "FormField", `Actual quantity for ${item.name}`, "0.3");
    enter(recorder(), "FormField", `Actual cost per unit for ${item.name}`, "1");
    expect(elements(lineTotal()).flatMap(element => element.props.children as unknown[]).join(" ")).toContain("must be whole currency");
    press(recorder(), "Review actual purchase…");
    expect(elements(recorder()).find(element => element.type === "MutationFeedback")?.props.error).toContain("must be whole currency");
    expect(scenario.confirmPurchase).not.toHaveBeenCalled();
  });

  it("recovers an ambiguous purchase after remount and retries the exact durable body and key", async () => {
    scenario.confirmPurchase.mockRejectedValueOnce(new ApiNetworkError());
    selectPurchasedItem();
    enter(recorder(), "FormField", `Actual quantity for ${item.name}`, "2");
    enter(recorder(), "FormField", `Actual cost per unit for ${item.name}`, "1500");
    press(recorder(), "Review actual purchase…");
    (find(recorder(), "ConfirmDialog", "Confirm actual purchase").props.onConfirm as () => void)(); await tick();
    expect(scenario.begin).toHaveBeenCalledBefore(scenario.confirmPurchase);
    expect(scenario.complete).not.toHaveBeenCalled();
    expect(find(render(PurchasingScreen), "Choices", "Purchasing workspace").props.disabled).toBe(true);
    const savedAttempt = await scenario.begin.mock.results[0].value;
    scenario.load.mockResolvedValue(savedAttempt); scenario.frames.clear();
    expect(text(render(PurchasingScreen))).toContain("Checking pending purchase recovery");
    await tick();
    const recovered = render(PurchasingScreen);
    expect(text(recovered)).toContain("Resolve pending purchase");
    press(recovered, "Retry saved purchase safely"); await tick();
    expect(scenario.confirmPurchase).toHaveBeenCalledTimes(2);
    expect(scenario.confirmPurchase.mock.calls[1]).toEqual(scenario.confirmPurchase.mock.calls[0]);
    expect(scenario.complete).toHaveBeenCalledExactlyOnceWith(savedAttempt.key);
    expect(scenario.payment).not.toHaveBeenCalled(); expect(scenario.createSheet).not.toHaveBeenCalled();
  });

  it("never sends a purchase when its durable attempt cannot be saved", async () => {
    scenario.begin.mockRejectedValueOnce(new Error("secure storage unavailable"));
    selectPurchasedItem();
    enter(recorder(), "FormField", `Actual quantity for ${item.name}`, "2");
    enter(recorder(), "FormField", `Actual cost per unit for ${item.name}`, "1500");
    press(recorder(), "Review actual purchase…");
    (find(recorder(), "ConfirmDialog", "Confirm actual purchase").props.onConfirm as () => void)(); await tick();
    expect(scenario.begin).toHaveBeenCalledOnce(); expect(scenario.confirmPurchase).not.toHaveBeenCalled();
  });

  it("blocks new purchase drafts while recovery storage cannot be read", async () => {
    scenario.load.mockRejectedValueOnce(new Error("secure storage unavailable")); scenario.frames.clear();
    render(PurchasingScreen); await tick();
    const node = render(PurchasingScreen);
    expect(text(node)).toContain("Pending purchase recovery is unavailable");
    expect(elements(node).some(element => typeof element.type === "function" && element.type.name === "ViewDraft")).toBe(false);
    expect(scenario.confirmPurchase).not.toHaveBeenCalled();
  });
});
