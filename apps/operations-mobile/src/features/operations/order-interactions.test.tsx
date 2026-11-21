import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import type { ManagerOrderDetailDto, OrderSummaryDto, QueueTicketManagerDto } from "@restaurant-platform/shared-types";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as { deps: unknown[]; cleanup?: () => void }[], state: 0, ref: 0, effect: 0,
  role: "STAFF", tenant: "restaurant-a", order: {} as ManagerOrderDetailDto, tickets: [] as QueueTicketManagerDto[],
  execute: vi.fn(), collect: vi.fn(), pickup: vi.fn(), getOrder: vi.fn(), call: vi.fn(), reload: vi.fn(), signOut: vi.fn(),
  listOrders: vi.fn(), queries: [] as { key: string; load(signal: AbortSignal): Promise<unknown> }[], ordersStatus: "ready",
  ordersPage: { content: [] as OrderSummaryDto[], number: 1, first: false, last: false, totalPages: 3, totalElements: 45 }
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const i = harness.state++;
    if (!(i in harness.states)) harness.states[i] = typeof initial === "function" ? initial() : initial;
    const values = harness.states;
    return [values[i], (value: unknown) => { values[i] = typeof value === "function" ? value(values[i]) : value; }];
  },
  useRef(initial: unknown) { const i = harness.ref++; return harness.refs[i] ?? (harness.refs[i] = { current: initial }); },
  useEffect(effect: () => (() => void) | undefined, deps: unknown[] = []) {
    const i = harness.effect++; const previous = harness.effects[i];
    if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
      previous?.cleanup?.(); harness.effects[i] = { deps, cleanup: effect() };
    }
  }
}));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("expo-router", () => ({ Link: "Link" }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Badge: "Badge", Card: "Card", ConfirmDialog: "ConfirmDialog",
  DataTable: "DataTable", FormField: "FormField", Page: "Page", Status: "Status" }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("./CounterOrderPanel", () => ({ CounterOrderPanel: "CounterOrderPanel" }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: { status: "ready", userId: "handler-a",
  membership: { restaurantId: harness.tenant, role: harness.role } }, signOut: harness.signOut }) }));
vi.mock("../../api", () => ({ getOperationsApi: () => ({ executeOrderAction: harness.execute, collectPayment: harness.collect,
  updateOrderStatus: harness.pickup, getOrder: harness.getOrder, callQueueTicket: harness.call, listOrders: harness.listOrders }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (load: (signal: AbortSignal) => Promise<unknown>, key: string) => {
  harness.queries.push({ key, load });
  return { reload: harness.reload, state: { status: key.startsWith("orders:") ? harness.ordersStatus : "ready", data: key.startsWith("queue:") ? harness.tickets : key.startsWith("orders:")
    ? harness.ordersPage : key.startsWith("order-payments:")
      ? [{ id: "cash", method: "CASH_AT_COUNTER", status: "PENDING", amount: 2500 }] : harness.order } };
} }));

import { OrderCardActions } from "./OrderCardActions";
import { OrderDetailScreen } from "./OrderDetailScreen";
import { QueueScreen } from "./QueueScreen";
import { CancellationReason } from "./OrderPresentation";
import { OrdersScreen } from "./OrdersScreen";

type Props = Record<string, unknown>;
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  let children = node.props.children as ReactNode;
  if (node.type === "QueryResult" as unknown) {
    const state = node.props.state as { status: string; data: unknown };
    children = state.status === "ready" ? (node.props.children as (data: unknown) => ReactNode)(state.data) : null;
  } else if (node.type === CancellationReason) children = CancellationReason(node.props as Parameters<typeof CancellationReason>[0]);
  return [node, ...elements(children)];
}
function render(component: () => ReactNode) {
  harness.state = 0; harness.ref = 0; harness.effect = 0;
  return elements(component());
}
function action(tree: ReactElement<Props>[], title: string) {
  return tree.find(node => node.type === "Action" as unknown && String(node.props.title).startsWith(title))!.props as {
    disabled?: boolean; onPress(): void;
  };
}
function confirmation(tree: ReactElement<Props>[]) {
  return tree.find(node => node.type === "ConfirmDialog" as unknown)!.props as {
    visible: boolean; confirmDisabled?: boolean; message: string; onConfirm(): void;
  };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function summary(): OrderSummaryDto {
  return { id: "order-a", orderNumber: "A-1042", orderType: "TAKEAWAY", orderChannel: "STAFF", status: "PENDING",
    subtotal: 2500, deliveryFee: 0, totalAmount: 2500, createdAt: "2026-11-20T08:00:00Z", availableActions: ["ACCEPT", "CANCEL"] };
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  harness.effects.forEach(effect => effect.cleanup?.()); harness.states = []; harness.refs = []; harness.effects = [];
  harness.role = "STAFF"; harness.tenant = "restaurant-a";
  harness.queries = []; harness.listOrders.mockReset().mockResolvedValue({ content: [] });
  harness.ordersStatus = "ready";
  harness.ordersPage = { content: [], number: 1, first: false, last: false, totalPages: 3, totalElements: 45 };
  harness.order = { ...summary(), restaurantId: harness.tenant, queueTicketId: "ticket-a", orderType: "TAKEAWAY", status: "READY",
    items: [], statusHistory: [], availableActions: [] } as unknown as ManagerOrderDetailDto;
  harness.tickets = [{ ticketId: "ticket-a", orderId: "order-a", displayCode: "A024", status: "CALLED", createdAt: "2026-11-20T08:00:00Z" }] as QueueTicketManagerDto[];
  for (const fn of [harness.execute, harness.collect, harness.pickup, harness.call, harness.reload, harness.signOut]) fn.mockReset().mockResolvedValue(undefined);
  harness.getOrder.mockReset().mockImplementation(async () => harness.order);
});

describe("supported triage queries", () => {
  it("resets pages when changing groups and sends only the reviewed server-supported status", async () => {
    const view = () => OrdersScreen({});
    action(render(view), "Next page").onPress(); render(view);
    expect(harness.queries.at(-1)?.key).toBe("orders:1:PENDING");
    action(render(view), "Active").onPress(); render(view);
    expect(harness.queries.at(-1)?.key).toBe("orders:0:ACCEPTED");
    action(render(view), "Filters ·").onPress();
    const filter = render(view).find(node => String(node.props.label).startsWith("Order status across"))!;
    (filter.props.onChange as (value: string) => void)("PREPARING"); render(view);
    const controller = new AbortController(); await harness.queries.at(-1)!.load(controller.signal);
    expect(harness.listOrders).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 20, status: "PREPARING" }, { signal: controller.signal });
    action(render(view), "History").onPress(); render(view);
    expect(harness.queries.at(-1)?.key).toBe("orders:0:COMPLETED");
    const field = render(view).find(node => node.type === "FormField" as unknown)!;
    (field.props.onChangeText as (value: string) => void)("A-1042"); render(view);
    expect(harness.queries.at(-1)?.key).toBe("orders:0:COMPLETED");
    expect(harness.listOrders).toHaveBeenCalledTimes(1);
  });
});

describe("reviewed order actions with the actual mutation gate", () => {
  it.each(["confirmed", "uncertain", "revoked"])("retains page-owned attempt locks through local filter unmount/remount after a %s result", async outcome => {
    type Frame = { states: unknown[]; refs: { current: unknown }[]; effects: { deps: unknown[]; cleanup?: () => void }[] };
    const frames: Frame[] = [];
    const frame = () => { const value: Frame = { states: [], refs: [], effects: [] }; frames.push(value); return value; };
    const parent = frame(); let card = frame();
    const inFrame = (current: Frame, component: () => ReactNode) => {
      harness.states = current.states; harness.refs = current.refs; harness.effects = current.effects;
      return render(component);
    };
    const parentTree = () => inFrame(parent, () => OrdersScreen({}));
    const cardProps = () => parentTree().find(node => node.type === OrderCardActions)!.props as Parameters<typeof OrderCardActions>[0];
    const cardTree = () => { const props = cardProps(); return inFrame(card, () => OrderCardActions(props)); };
    const search = (value: string) => {
      const field = parentTree().find(node => String(node.props.label).startsWith("Search this page"))!;
      (field.props.onChangeText as (value: string) => void)(value);
    };
    harness.ordersPage = { ...harness.ordersPage, content: [summary()] };
    harness.reload.mockImplementation(() => { harness.ordersStatus = "loading"; });
    let finish!: () => void; let fail!: (error: unknown) => void;
    harness.execute.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }));
    action(cardTree(), "Accept").onPress(); confirmation(cardTree()).onConfirm();
    expect(harness.execute).toHaveBeenCalledTimes(1);
    search("no-such-order"); expect(parentTree().some(node => node.type === OrderCardActions)).toBe(false);
    card.effects.forEach(effect => effect.cleanup?.()); card = frame();
    search(""); expect(action(cardTree(), "Accept").disabled).toBe(true);
    // A saved event from another card instance cannot get past the page lock.
    action(cardTree(), "Accept").onPress();
    const blockedReview = confirmation(cardTree()); expect(blockedReview.confirmDisabled).toBe(true); blockedReview.onConfirm();
    expect(harness.execute).toHaveBeenCalledTimes(1);
    if (outcome === "confirmed") finish(); else fail(new ApiNetworkError());
    await tick();
    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(parentTree().some(node => node.type === OrderCardActions)).toBe(false);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    card.effects.forEach(effect => effect.cleanup?.()); card = frame();
    if (outcome === "revoked") {
      harness.ordersStatus = "denied";
      expect(parentTree().some(node => node.type === OrderCardActions)).toBe(false);
    } else {
      harness.ordersStatus = "ready";
      harness.ordersPage = { ...harness.ordersPage, content: [{ ...summary(), ...(outcome === "confirmed" ? { status: "ACCEPTED", availableActions: ["COMPLETE"] as const } : {}) }] };
      const reviewed = cardTree(); expect(action(reviewed, outcome === "confirmed" ? "Complete" : "Accept").disabled).toBe(false);
      expect(confirmation(reviewed).visible).toBe(false);
    }
    expect(harness.execute).toHaveBeenCalledTimes(1);
    frames.forEach(current => current.effects.forEach(effect => effect.cleanup?.()));
  });

  it.each(["restaurant-a", "restaurant-b"])("sends one confirmed expected-status action for %s, with no payment write", async tenant => {
    harness.tenant = tenant;
    let finish!: () => void;
    harness.execute.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = () => OrderCardActions({ order: summary(), role: "STAFF", onChanged: harness.reload });
    action(render(view), "Accept").onPress();
    const review = confirmation(render(view)); expect(review.visible).toBe(true);
    expect(harness.execute).not.toHaveBeenCalled();
    review.onConfirm(); review.onConfirm();
    expect(harness.execute).toHaveBeenCalledExactlyOnceWith("order-a", { action: "ACCEPT", expectedStatus: "PENDING", reason: null });
    expect(harness.collect).not.toHaveBeenCalled(); finish(); await tick(); expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it.each(["short", "          ", "x".repeat(501), "!".repeat(12)])("does not send an invalid cancellation reason: %s", reason => {
    const view = () => OrderCardActions({ order: summary(), role: "STAFF", onChanged: harness.reload });
    action(render(view), "Cancel order").onPress();
    const field = render(view).find(node => node.type === "FormField" as unknown)!;
    (field.props.onChangeText as (value: string) => void)(reason);
    const review = confirmation(render(view)); expect(review.confirmDisabled).toBe(true); review.onConfirm();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("preserves Staff early unpaid cancellation only when supplied by availableActions", async () => {
    const order = summary();
    const view = () => OrderCardActions({ order, role: "STAFF", onChanged: harness.reload });
    action(render(view), "Cancel order").onPress();
    const field = render(view).find(node => node.type === "FormField" as unknown)!;
    (field.props.onChangeText as (value: string) => void)("  Customer requested cancellation  ");
    const review = confirmation(render(view)); expect(review.confirmDisabled).toBe(false); review.onConfirm(); await tick();
    expect(harness.execute).toHaveBeenCalledWith("order-a", { action: "CANCEL", expectedStatus: "PENDING", reason: "Customer requested cancellation" });
    order.availableActions = ["ACCEPT"];
    expect(render(view).some(node => String(node.props.title).startsWith("Cancel order"))).toBe(false);
  });

  it.each([new ApiHttpError(409, "ORDER_ACTION_STALE"), new ApiNetworkError()])("requires reload and fresh review after conflict or unknown outcome", async failure => {
    harness.execute.mockRejectedValueOnce(failure);
    const view = () => OrderCardActions({ order: summary(), role: "STAFF", onChanged: harness.reload });
    action(render(view), "Accept").onPress(); confirmation(render(view)).onConfirm(); await tick();
    const tree = render(view); expect(action(tree, "Accept").disabled).toBe(true);
    expect(harness.execute).toHaveBeenCalledTimes(1); expect(harness.reload).toHaveBeenCalledTimes(1);
    action(tree, "Reload latest order").onPress(); expect(harness.reload).toHaveBeenCalledTimes(2);
    expect(harness.execute).toHaveBeenCalledTimes(1);
  });

  it("records physical counter cash only through collectPayment after confirmation", async () => {
    const view = () => OrderDetailScreen({ orderId: "order-a" });
    action(render(view), "Confirm cash collected").onPress();
    const review = confirmation(render(view)); expect(review.message).toContain("physically received 2,500");
    expect(harness.collect).not.toHaveBeenCalled(); review.onConfirm(); await tick();
    expect(harness.collect).toHaveBeenCalledExactlyOnceWith("order-a", "cash");
    expect(harness.execute).not.toHaveBeenCalled(); expect(harness.pickup).not.toHaveBeenCalled();
  });
});

describe("queue readiness, calling and physical collection", () => {
  it("calls a READY ticket without completing the order or collecting money", async () => {
    harness.tickets[0].status = "READY";
    const view = () => QueueScreen(); const tree = render(view);
    expect(tree.some(node => String(node.props.title).startsWith("Confirm physical pickup"))).toBe(false);
    action(tree, "Call for pickup").onPress(); confirmation(render(view)).onConfirm(); await tick();
    expect(harness.call).toHaveBeenCalledExactlyOnceWith("ticket-a");
    expect(harness.pickup).not.toHaveBeenCalled(); expect(harness.collect).not.toHaveBeenCalled();
  });
  it("re-reads the linked READY order before confirmed pickup of a CALLED ticket", async () => {
    const view = () => QueueScreen();
    action(render(view), "Confirm physical pickup").onPress(); confirmation(render(view)).onConfirm(); await tick();
    expect(harness.getOrder).toHaveBeenCalledExactlyOnceWith("order-a");
    expect(harness.pickup).toHaveBeenCalledExactlyOnceWith("order-a", { status: "COMPLETED", note: "Physical pickup confirmed at collection counter." });
    expect(harness.execute).not.toHaveBeenCalled(); expect(harness.collect).not.toHaveBeenCalled();
  });
  it.each(["CANCELLED", "COMPLETED", "PREPARING"])("blocks physical pickup when the linked order changed to %s", async status => {
    harness.order.status = status; const view = () => QueueScreen();
    action(render(view), "Confirm physical pickup").onPress(); confirmation(render(view)).onConfirm(); await tick();
    expect(harness.pickup).not.toHaveBeenCalled(); expect(action(render(view), "Confirm physical pickup").disabled).toBe(true);
  });
});
