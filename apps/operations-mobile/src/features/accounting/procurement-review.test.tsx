import { isValidElement, type ReactElement, type ReactNode } from "react";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseDetail } from "@restaurant-platform/shared-types";

const scenario = vi.hoisted(() => ({ frames: new Map<string, unknown[]>(), active: "", index: 0,
  supplier: { id: "supplier-a", name: "ဟင်းသီးဟင်းရွက် Produce", contact: "Contact A", active: true },
  detail: null as unknown as PurchaseDetail, create: vi.fn(), update: vi.fn(), pay: vi.fn(), read: vi.fn(), reload: vi.fn(), dirty: vi.fn()
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useEffect: () => undefined,
  useState(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!; const index = scenario.index++;
    if (!(index in frame)) frame[index] = typeof initial === "function" ? initial() : initial;
    return [frame[index], (value: unknown) => { frame[index] = typeof value === "function" ? value(frame[index]) : value; }];
  }
}));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", FormField: "FormField", ConfirmDialog: "ConfirmDialog", StateView: "StateView" }));
vi.mock("../../components/forms", () => ({ FormToggle: "FormToggle", MutationFeedback: "MutationFeedback" }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("../management/controls", () => ({ Choices: "Choices" }));
vi.mock("./FinancialPeriodFields", () => ({ FinancialPeriodFields: "FinancialPeriodFields" }));
vi.mock("./FinancialPagination", () => ({ FinancialPagination: "FinancialPagination" }));
vi.mock("./AccountingCsvAction", () => ({ AccountingCsvAction: "AccountingCsvAction" }));
vi.mock("../../hooks/useUnsavedChanges", () => ({ useUnsavedChanges: (dirty: boolean) => scenario.dirty(dirty),
  useDraftNavigation: () => ({ requestNavigation: (action: () => void) => action() }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => ({ state: { status: "ready",
  data: key.startsWith("purchase-detail:") ? scenario.detail : { content: [scenario.supplier], page: 0, size: 20, totalElements: 1 } }, reload: scenario.reload }) }));
vi.mock("../../hooks/useApiMutation", () => ({ useApiMutation: () => ({ busy: false, error: null, message: null,
  run: async (action: () => Promise<unknown>, done?: (value: unknown) => void, failed?: (error: unknown) => void) => {
    try { done?.(await action()); } catch (error) { failed?.(error); }
  }
}) }));
vi.mock("../../api", () => ({ getOperationsApi: () => ({ createAccountingSupplier: scenario.create,
  updateAccountingSupplier: scenario.update, recordPurchasePayment: scenario.pay, getPurchase: scenario.read }) }));

import { FinancialRequestKeys } from "./financial-requests";
import { PurchaseDetailScreen } from "./PurchaseScreens";
import { SupplierRegister } from "./SupplierScreens";

type Element = ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => ReactNode;
let requests = new FinancialRequestKeys();
function render(component: Component, props: Record<string, unknown> = {}): ReactNode {
  scenario.active = component.name; scenario.index = 0;
  if (!scenario.frames.has(scenario.active)) scenario.frames.set(scenario.active, []);
  return expand(component(props));
}
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function") return render(node.type as Component, node.props);
  if (node.type === "QueryResult") return expand((node.props.children as (value: unknown) => ReactNode)((node.props.state as { data: unknown }).data));
  return { ...node, props: { ...node.props, children: expand(node.props.children as ReactNode) } };
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node) || node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(node: ReactNode, type: string, label: string) {
  const item = elements(node).find(element => element.type === type && [element.props.title, element.props.label].includes(label));
  if (!item) throw new Error(`Missing ${type}: ${label}`); return item;
}
function press(node: ReactNode, label: string) { (find(node, "Action", label).props.onPress as () => void)(); }
function enter(node: ReactNode, label: string, value: string) { (find(node, "FormField", label).props.onChangeText as (value: string) => void)(value); }
function confirm(node: ReactNode, title: string) { (find(node, "ConfirmDialog", title).props.onConfirm as () => void)(); }
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (!isValidElement<Record<string, unknown>>(node)) return typeof node === "string" ? node : "";
  return [node.props.title, node.props.message, text(node.props.children as ReactNode)].filter(Boolean).join(" ");
}
const suppliers = () => render(SupplierRegister as Component, { requests });
const purchase = () => render(PurchaseDetailScreen as Component, { id: "purchase-a", requests, onBack: vi.fn(), onChanged: vi.fn(), onSelectPurchase: vi.fn(), onReplace: vi.fn() });
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

beforeEach(() => {
  vi.clearAllMocks(); scenario.frames.clear(); let sequence = 0; requests = new FinancialRequestKeys(() => `request-${++sequence}`);
  scenario.supplier = { id: "supplier-a", name: "ဟင်းသီးဟင်းရွက် Produce", contact: "Contact A", active: true };
  scenario.detail = { purchase: { id: "purchase-a", purchaseDate: "2026-11-01", purchasedAt: "2026-11-01T10:00:00+06:30", supplierId: "supplier-a",
    supplierName: "Original supplier", totalAmount: "9007199254740993", amountPaid: "0", outstandingAmount: "9007199254740993", paymentStatus: "UNPAID", status: "CONFIRMED",
    dueDate: null, invoiceReference: "INV-A", receiptId: null, correctionOfId: null, createdBy: "owner-a", createdAt: "2026-11-01T04:00:00Z" },
    lines: [{ id: "line-a", itemId: "item-a", itemName: "Historical rice", quantity: "1.5", unit: "kg", unitCost: "200", lineTotal: "300", supplierId: "supplier-a" }],
    payments: [], cancellations: [], corrections: [] };
  scenario.pay.mockResolvedValue(scenario.detail); scenario.read.mockResolvedValue(scenario.detail); scenario.update.mockResolvedValue(scenario.supplier);
});

describe("UXI-12 procurement reviews", () => {
  it("requires supplier profile review and preserves the historical supplier snapshot", async () => {
    press(suppliers(), `Edit ${scenario.supplier.name}`); enter(suppliers(), "Supplier name", "Updated supplier");
    enter(suppliers(), "Correction reason", "Contact changed"); press(suppliers(), "Review supplier details · ပေးသွင်းသူကို စစ်ဆေးရန်");
    expect(scenario.update).not.toHaveBeenCalled(); expect(text(suppliers())).toContain("Historical purchases remain unchanged");
    confirm(suppliers(), "Save supplier? · ပေးသွင်းသူကို သိမ်းမလား"); await settle();
    expect(scenario.update).toHaveBeenCalledWith("supplier-a", { name: "Updated supplier", contact: "Contact A", active: true, reason: "Contact changed" }, "request-1");
    expect(scenario.detail.purchase.supplierName).toBe("Original supplier"); expect(scenario.dirty).toHaveBeenCalledWith(true);
  });

  it("invalidates an old supplier review when the form changes", () => {
    press(suppliers(), `Edit ${scenario.supplier.name}`); enter(suppliers(), "Correction reason", "Correct contact");
    press(suppliers(), "Review supplier details · ပေးသွင်းသူကို စစ်ဆေးရန်"); enter(suppliers(), "Supplier contact details", "Contact B");
    confirm(suppliers(), "Save supplier? · ပေးသွင်းသူကို သိမ်းမလား");
    expect(elements(suppliers()).find(element => element.type === "MutationFeedback")?.props.error).toContain("Review again");
    expect(scenario.update).not.toHaveBeenCalled();
  });

  it("caps payment exactly at a balance above the JS safe integer and reviews actual money", () => {
    enter(purchase(), "Payment amount (whole currency)", "9007199254740994"); press(purchase(), "Review payment…");
    expect(elements(purchase()).find(element => element.type === "MutationFeedback")?.props.error).toContain("exceeds");
    enter(purchase(), "Payment amount (whole currency)", "9007199254740993"); press(purchase(), "Review payment…");
    const message = find(purchase(), "ConfirmDialog", "Record purchase payment").props.message;
    expect(message).toContain("9,007,199,254,740,993"); expect(message).toContain("already been paid"); expect(scenario.pay).not.toHaveBeenCalled();
  });

  it("hides the private purchase and financial actions after payment permission is denied", async () => {
    scenario.pay.mockRejectedValueOnce(new ApiHttpError(403, "ACCESS_DENIED"));
    enter(purchase(), "Payment amount (whole currency)", "80");
    press(purchase(), "Review payment…"); confirm(purchase(), "Record purchase payment"); await settle();
    const node = purchase();
    expect(find(node, "StateView", "Financial permission denied · ငွေစာရင်းခွင့် မရှိပါ").props.kind).toBe("denied");
    expect(text(node)).not.toContain("Original supplier"); expect(text(node)).not.toContain("Historical rice");
    expect(text(node)).not.toContain("9,007,199,254,740,993");
    expect(elements(node).some(element => element.type === "Action" && element.props.title === "Review payment…")).toBe(false);
    expect(elements(node).some(element => element.type === "ConfirmDialog")).toBe(false);
    expect(scenario.pay).toHaveBeenCalledOnce();
  });

  it("holds a timed out payment across detail remount, reads history and requires new review with the retained key", async () => {
    scenario.pay.mockRejectedValueOnce(new ApiNetworkError());
    enter(purchase(), "Payment amount (whole currency)", "80");
    enter(purchase(), "Actual payment timestamp (with timezone)", "2026-11-02T10:00:00+06:30");
    press(purchase(), "Review payment…"); confirm(purchase(), "Record purchase payment"); await settle();
    const prior = scenario.pay.mock.calls[0]; expect(requests.isUncertain("purchase-pay:purchase-a")).toBe(true);
    scenario.frames.clear(); expect(text(purchase())).toContain("Financial result uncertain");
    expect(find(purchase(), "Action", "Review payment…").props.disabled).toBe(true);
    scenario.read.mockResolvedValue({ ...scenario.detail, purchase: { ...scenario.detail.purchase, invoiceReference: "CURRENT-HISTORY" } });
    scenario.read.mockRejectedValueOnce(new ApiNetworkError());
    press(purchase(), "Check financial history · မှတ်တမ်းပြန်စစ်ရန်"); await settle();
    expect(requests.isUncertain("purchase-pay:purchase-a")).toBe(true);
    press(purchase(), "Check financial history · မှတ်တမ်းပြန်စစ်ရန်"); await settle();
    expect(scenario.read).toHaveBeenCalledWith("purchase-a"); expect(scenario.pay).toHaveBeenCalledOnce();
    expect(text(purchase())).toContain("CURRENT-HISTORY");
    expect(requests.isUncertain("purchase-pay:purchase-a")).toBe(true);
    expect(find(purchase(), "Action", "Review payment…").props.disabled).toBe(true);
    press(purchase(), "I reviewed current history · မှတ်တမ်းစစ်ပြီးပါပြီ");
    expect(requests.isUncertain("purchase-pay:purchase-a")).toBe(false);
    enter(purchase(), "Payment amount (whole currency)", "80"); enter(purchase(), "Actual payment timestamp (with timezone)", "2026-11-02T10:00:00+06:30");
    press(purchase(), "Review payment…"); expect(scenario.pay).toHaveBeenCalledOnce();
    confirm(purchase(), "Record purchase payment"); await settle(); expect(scenario.pay.mock.calls[1]).toEqual(prior);
  });
});
