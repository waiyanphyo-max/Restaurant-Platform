import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiTimeoutError, type CashbookDay, type ExpenseDetail } from "@restaurant-platform/api-client";

type Frame = { values: unknown[] };
const h = vi.hoisted(() => ({ frames: new Map<string, Frame>(), active: "", cursor: 0, data: {} as Record<string, unknown>,
  createExpense: vi.fn(), payExpense: vi.fn(), createCashMovement: vi.fn(), openCashbook: vi.fn(), closeCashbook: vi.fn(),
  confirmExpenseTemplate: vi.fn(), getCashbookDay: vi.fn(), getCashbookTransactions: vi.fn(), getExpense: vi.fn(), listExpenses: vi.fn(), reload: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useEffect() {},
  useState(initial: unknown) {
    const frame = h.frames.get(h.active)!; const index = h.cursor++;
    if (!(index in frame.values)) frame.values[index] = typeof initial === "function" ? initial() : initial;
    return [frame.values[index], (value: unknown) => { frame.values[index] = typeof value === "function" ? value(frame.values[index]) : value; }];
  }
}));
vi.mock("react-native", () => ({ View: "View", Text: "Text", Switch: "Switch", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("../../components/ui", () => Object.fromEntries(["Action", "Body", "Card", "ConfirmDialog", "DataTable", "FormField", "Page", "StateView"].map(name => [name, name])));
vi.mock("../../components/forms", () => ({ MutationFeedback: "MutationFeedback", FormToggle: "FormToggle" }));
vi.mock("../management/controls", () => ({ Choices: "Choices", FormStatus: "FormStatus" }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("../../navigation/OperationsLanguage", () => ({ useOperationsText: () => (english: string) => english }));
vi.mock("../../api", () => ({ getOperationsApi: () => h }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => ({
  state: { status: "ready", data: h.data[Object.keys(h.data).find(prefix => key.includes(prefix)) ?? ""] }, reload: h.reload
}) }));
vi.mock("../../hooks/useApiMutation", () => ({ useApiMutation: () => ({ busy: false, error: null, message: null, reset() {},
  async run(action: () => Promise<unknown>, success?: (value: unknown) => void, failure?: (error: unknown) => void) {
    try { success?.(await action()); } catch (error) { failure?.(error); }
  }
}) }));

import { CashbookScreen, DailyCashClosingScreen } from "./CashbookScreens";
import { ExpenseScreen } from "./ExpenseCashScreens";
import { FinancialRequestKeys } from "./financial-requests";

type Props = Record<string, unknown>;
type Element = ReactElement<Props>;
function run(component: (props: Props) => ReactNode, props: Props = {}, key = component.name): ReactNode {
  h.active = key; h.cursor = 0;
  if (!h.frames.has(key)) h.frames.set(key, { values: [] });
  return component(props);
}
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement<Props>(node)) return node;
  if (typeof node.type === "function") return expand(run(node.type as (props: Props) => ReactNode, node.props, `${node.type.name}:${node.key ?? ""}`));
  if (node.type === "QueryResult") return expand((node.props.children as (data: unknown) => ReactNode)((node.props.state as { data: unknown }).data));
  return { ...node, props: { ...node.props, children: expand(node.props.children as ReactNode) } };
}
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node) || node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...nodes(node.props.children as ReactNode)];
}
function tree(component: typeof ExpenseScreen | typeof CashbookScreen, keys: FinancialRequestKeys) { return nodes(expand(run(component as (props: Props) => ReactNode, { requestKeys: keys }))); }
function find(items: Element[], type: string, label: string) {
  const match = items.find(node => node.type === type && [node.props.title, node.props.label].includes(label));
  if (!match) throw new Error(`Missing ${type}: ${label}`);
  return match.props;
}
function press(items: Element[], label: string) { const action = find(items, "Action", label); if (!action.disabled) (action.onPress as () => void)(); }
function input(items: Element[], label: string, value: string) { (find(items, "FormField", label).onChangeText as (value: string) => void)(value); }
function confirm(items: Element[], title: string) { const dialog = find(items, "ConfirmDialog", title); if (!dialog.confirmDisabled) (dialog.onConfirm as () => void)(); }
async function tick() { for (let index = 0; index < 12; index++) await Promise.resolve(); }

const page = { items: [], page: 0, size: 20, total: 0 };
const day: CashbookDay = { date: "2026-11-02", timezone: "Asia/Yangon", openingBalance: "100", expectedClosingCash: "150",
  cashSalesReceived: "50", cashRefundsPaid: "0", cashPurchasePayments: "0", cashExpensePayments: "0", otherReceipts: "0", otherPayments: "0", missingInputs: [], closing: null };
const detail: ExpenseDetail = { expense: { id: "expense-a", category: "RENT", amount: "9007199254740993", paidAmount: "1", outstandingAmount: "9007199254740992",
  expenseDate: "2026-11-02", description: "Historical rent", payee: null, paymentStatus: "PARTIALLY_PAID", receiptId: null, templateId: null,
  recordedBy: "member-a", createdAt: "2026-11-02T09:00:00+06:30", cancelledAt: null, cancelledBy: null, cancellationReason: null }, payments: [] };
beforeEach(() => {
  vi.stubGlobal("React", React); vi.clearAllMocks(); h.frames.clear();
  h.data = { expenses: { ...page, items: [detail.expense] }, "expense-report": { from: day.date, to: day.date, totals: [] }, "expense-detail": detail,
    "cash-day": { ...day }, "cash-closings": page, "cash-transactions": page, "expense-templates": [{ id: "template-a", description: "Monthly rent", category: "RENT", amount: "100", startsOn: day.date, frequency: "MONTHLY", active: true }] };
  h.createExpense.mockResolvedValue(detail.expense); h.payExpense.mockResolvedValue(detail); h.getExpense.mockResolvedValue(detail);
  h.createCashMovement.mockResolvedValue({ id: "movement-a" }); h.getCashbookTransactions.mockResolvedValue(page); h.listExpenses.mockResolvedValue(page);
  h.openCashbook.mockResolvedValue({ id: "opening-a" }); h.closeCashbook.mockResolvedValue({ id: "closing-a" }); h.getCashbookDay.mockResolvedValue(day);
  h.confirmExpenseTemplate.mockResolvedValue(detail.expense);
});

describe("reviewed expense and cash postings", () => {
  it("reviews an expense obligation with exact money before creating it, without paying it", async () => {
    const keys = new FinancialRequestKeys(); const view = () => tree(ExpenseScreen, keys);
    press(view(), "Add expense"); input(view(), "Whole-currency amount", "9007199254740993"); input(view(), "Expense date (YYYY-MM-DD)", day.date); input(view(), "Description", "Rent obligation");
    press(view(), "Review expense · အသုံးစရိတ်စစ်ရန်"); expect(h.createExpense).not.toHaveBeenCalled();
    confirm(view(), "Record this expense obligation?"); await tick();
    expect(h.createExpense.mock.calls[0][0]).toMatchObject({ amount: "9007199254740993", expenseDate: day.date, description: "Rent obligation" });
    expect(h.payExpense).not.toHaveBeenCalled();
  });

  it("caps actual expense payments exactly and freezes the reviewed amount and offset timestamp", async () => {
    const keys = new FinancialRequestKeys(); const view = () => tree(ExpenseScreen, keys);
    press(view(), "View expense detail"); input(view(), "Whole-currency payment amount", "9007199254740993");
    expect(find(view(), "Action", "Review actual payment · ငွေပေးချေမှုစစ်ရန်").disabled).toBe(true);
    input(view(), "Whole-currency payment amount", "9007199254740992"); input(view(), "Actual payment timestamp (ISO 8601 with offset)", "2026-11-02T10:15:00+06:30");
    press(view(), "Review actual payment · ငွေပေးချေမှုစစ်ရန်"); expect(h.payExpense).not.toHaveBeenCalled();
    input(view(), "Whole-currency payment amount", "1"); confirm(view(), "Record completed expense payment?"); await tick();
    expect(h.payExpense.mock.calls[0][1]).toEqual({ amount: "9007199254740992", method: "CASH", paidAt: "2026-11-02T10:15:00+06:30" });
  });

  it("posts recurring occurrences only after a separate explicit review", async () => {
    const keys = new FinancialRequestKeys(); const view = () => tree(ExpenseScreen, keys);
    press(view(), "Recurring expense templates"); expect(h.confirmExpenseTemplate).not.toHaveBeenCalled();
    input(view(), "Occurrence date to confirm (YYYY-MM-DD)", day.date); press(view(), "Review selected occurrence · အသုံးစရိတ်စစ်ရန်");
    expect(h.confirmExpenseTemplate).not.toHaveBeenCalled(); confirm(view(), "Post this actual expense occurrence?"); await tick();
    expect(h.confirmExpenseTemplate.mock.calls[0].slice(0, 2)).toEqual(["template-a", day.date]);
  });

  it("removes private expense detail and repeat payment controls after a financial 403", async () => {
    const keys = new FinancialRequestKeys(); const view = () => tree(ExpenseScreen, keys);
    press(view(), "View expense detail"); input(view(), "Whole-currency payment amount", "10");
    input(view(), "Actual payment timestamp (ISO 8601 with offset)", "2026-11-02T10:15:00+06:30");
    press(view(), "Review actual payment · ငွေပေးချေမှုစစ်ရန်"); h.payExpense.mockRejectedValueOnce(new ApiHttpError(403, "FORBIDDEN"));
    confirm(view(), "Record completed expense payment?"); await tick();
    const denied = view(); expect(denied.some(node => node.type === "StateView" && node.props.kind === "denied")).toBe(true);
    expect(denied.some(node => node.props.title === "Historical rent")).toBe(false);
    expect(denied.some(node => node.props.title === "Review actual payment · ငွေပေးချေမှုစစ်ရန်")).toBe(false);
    expect(denied.some(node => node.props.title === "Check financial history · မှတ်တမ်းပြန်စစ်ရန်")).toBe(false);
    expect(h.payExpense).toHaveBeenCalledOnce();
  });

  it("propagates a denied movement form to hide the parent cashbook ledger", async () => {
    h.data["cash-transactions"] = { ...page, total: 1, items: [{ id: "source-a", source: "OWNER_DEPOSIT", sourceId: "private-source", signedAmount: "9007199254740993", occurredAt: "2026-11-02T09:00:00+06:30", description: "Private cash movement", recordedBy: "member-a" }] };
    const keys = new FinancialRequestKeys(); const view = () => tree(CashbookScreen, keys);
    press(view(), "Record a cash movement"); input(view(), "Movement amount", "100"); input(view(), "Reason for this movement", "Actual cash");
    input(view(), "Actual movement timestamp (ISO 8601 with offset)", "2026-11-02T09:00:00+06:30");
    press(view(), "Review cash movement · ငွေအဝင်အထွက်စစ်ရန်"); h.createCashMovement.mockRejectedValueOnce(new ApiHttpError(403, "FORBIDDEN"));
    confirm(view(), "Record this physical cash event?"); await tick();
    expect(view().some(node => node.type === "StateView" && node.props.kind === "denied")).toBe(true);
    expect(view().some(node => node.type === "Card")).toBe(false);
    expect(view().some(node => node.type === "Action")).toBe(false); expect(h.createCashMovement).toHaveBeenCalledOnce();
  });

  it("propagates a denied count to hide parent closing history and private counts", async () => {
    const keys = new FinancialRequestKeys(); const view = () => tree(DailyCashClosingScreen, keys);
    input(view(), "Actual counted closing cash", "149"); press(view(), "Review closing count");
    h.closeCashbook.mockRejectedValueOnce(new ApiHttpError(403, "FORBIDDEN")); confirm(view(), "Finalize the cash count"); await tick();
    expect(view().some(node => node.type === "StateView" && node.props.kind === "denied")).toBe(true);
    expect(view().some(node => node.type === "Card" || node.type === "Action" || node.type === "ConfirmDialog")).toBe(false);
    expect(h.closeCashbook).toHaveBeenCalledOnce();
  });

  it("retains uncertain cash payload/key across remount and requires successful read plus acknowledgement", async () => {
    const keys = new FinancialRequestKeys(); const view = () => tree(CashbookScreen, keys);
    press(view(), "Record a cash movement"); input(view(), "Movement amount", "9007199254740993"); input(view(), "Reason for this movement", "Actual owner cash");
    input(view(), "Actual movement timestamp (ISO 8601 with offset)", "2026-11-02T23:30:00+06:30");
    press(view(), "Review cash movement · ငွေအဝင်အထွက်စစ်ရန်"); expect(h.createCashMovement).not.toHaveBeenCalled();
    h.createCashMovement.mockRejectedValueOnce(new ApiTimeoutError()); confirm(view(), "Record this physical cash event?"); await tick();
    const [body, requestKey] = h.createCashMovement.mock.calls[0]; expect(keys.isUncertain("cash.movement")).toBe(true);
    h.frames.clear(); press(view(), "Record a cash movement"); expect(find(view(), "Action", "Review cash movement · ငွေအဝင်အထွက်စစ်ရန်").disabled).toBe(true);
    h.getCashbookTransactions.mockRejectedValueOnce(new ApiTimeoutError()); press(view(), "Check financial history · မှတ်တမ်းပြန်စစ်ရန်"); await tick(); expect(keys.isUncertain("cash.movement")).toBe(true);
    press(view(), "Check financial history · မှတ်တမ်းပြန်စစ်ရန်"); await tick(); expect(keys.isUncertain("cash.movement")).toBe(true);
    expect(h.getCashbookTransactions.mock.calls.at(-1)?.[0]).toEqual({ from: "2026-11-01", to: "2026-11-03" });
    press(view(), "I reviewed current history · မှတ်တမ်းစစ်ပြီးပါပြီ"); expect(keys.isUncertain("cash.movement")).toBe(false);
    expect(keys.key("cash.movement", body)).toBe(requestKey); expect(h.createCashMovement).toHaveBeenCalledOnce();
  });

  it("withholds expected cash when opening is missing and reviews an exact initial count", async () => {
    h.data["cash-day"] = { ...day, openingBalance: null, expectedClosingCash: null };
    const keys = new FinancialRequestKeys(); const view = () => tree(DailyCashClosingScreen, keys);
    expect(view().some(node => node.props.title === "Review closing count")).toBe(false);
    input(view(), "Initial counted opening amount", "0"); input(view(), "Reason for initial opening", "Initial zero counted");
    press(view(), "Review initial opening · အဖွင့်ငွေစစ်ရန်"); expect(h.openCashbook).not.toHaveBeenCalled();
    confirm(view(), "Record initial counted cash?"); await tick(); expect(h.openCashbook.mock.calls[0][0]).toEqual({ date: day.date, amount: "0", reason: "Initial zero counted" });
  });

  it.each(["success", "timeout"])("keeps an in-flight movement held across tab remount until %s settles", async outcome => {
    let resolve!: (value: unknown) => void; let reject!: (reason: unknown) => void;
    h.createCashMovement.mockImplementationOnce(() => new Promise((accept, fail) => { resolve = accept; reject = fail; }));
    const keys = new FinancialRequestKeys(); const view = () => tree(CashbookScreen, keys);
    press(view(), "Record a cash movement"); input(view(), "Movement amount", "100"); input(view(), "Reason for this movement", "Actual cash event");
    input(view(), "Actual movement timestamp (ISO 8601 with offset)", "2026-11-02T09:00:00+06:30");
    press(view(), "Review cash movement · ငွေအဝင်အထွက်စစ်ရန်"); confirm(view(), "Record this physical cash event?");
    expect(keys.isPending("cash.movement")).toBe(true); h.frames.clear(); press(view(), "Record a cash movement");
    expect(find(view(), "Action", "Check financial history · မှတ်တမ်းပြန်စစ်ရန်").disabled).toBe(true);
    press(view(), "Check financial history · မှတ်တမ်းပြန်စစ်ရန်"); expect(h.getCashbookTransactions).not.toHaveBeenCalled();
    if (outcome === "success") resolve({ id: "movement-a" }); else reject(new ApiTimeoutError());
    await tick(); expect(keys.isPending("cash.movement")).toBe(false);
    expect(keys.isUncertain("cash.movement")).toBe(outcome === "timeout"); expect(h.createCashMovement).toHaveBeenCalledOnce();
  });

  it("invalidates a stale expected-cash confirmation and requires refreshed history and fresh review", async () => {
    const keys = new FinancialRequestKeys(); const view = () => tree(DailyCashClosingScreen, keys);
    input(view(), "Actual counted closing cash", "149"); press(view(), "Review closing count");
    h.closeCashbook.mockRejectedValueOnce(new ApiHttpError(409, "CASH_CLOSING_EXPECTED_CHANGED"));
    confirm(view(), "Finalize the cash count"); await tick();
    expect(h.reload).toHaveBeenCalled(); expect(find(view(), "Action", "Review closing count").disabled).toBe(true);
    expect(view().some(node => node.type === "ConfirmDialog" && node.props.visible)).toBe(false);
    expect(h.closeCashbook).toHaveBeenCalledOnce();
  });
});
