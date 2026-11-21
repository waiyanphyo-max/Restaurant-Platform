import { type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftNavigation } from "../hooks/useUnsavedChanges";

const harness = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, effects: [] as (() => (() => void) | void)[], cleanups: [] as (() => void)[],
  scope: "", status: "ready", userId: "owner-a", restaurantId: "restaurant-a", role: "OWNER",
  contexts: [] as unknown[],
  prevention: false, repeat: undefined as (() => void) | undefined,
  prevented: undefined as ((args: { repeat: () => void }) => void) | undefined,
  disable: vi.fn(),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = typeof initial === "function" ? initial() : initial;
    return [harness.values[index], (next: unknown) => {
      harness.values[index] = typeof next === "function" ? next(harness.values[index]) : next;
    }];
  },
  useRef(initial: unknown) {
    const index = harness.cursor++;
    harness.values[index] ??= { current: initial };
    return harness.values[index];
  },
  useMemo: (create: () => unknown) => create(),
  useContext: () => harness.contexts.shift(),
  useId: () => "draft-route",
  useEffect: (effect: () => (() => void) | void) => { harness.effects.push(effect); },
}));
vi.mock("expo-router", () => ({ usePreventRemove: (enabled: boolean, callback: typeof harness.prevented) => {
  harness.prevention = enabled; harness.prevented = callback;
  return harness.disable;
} }));
vi.mock("../components/ui", () => ({ ConfirmDialog: "ConfirmDialog" }));
vi.mock("./OperationsLanguage", () => ({ useOperationsText: () => (english: string) => english }));
vi.mock("../auth/AuthProvider", () => ({ useOperationsAuth: () => {
  const workspace = { status: "ready", userId: harness.userId,
    membership: { restaurantId: harness.restaurantId, role: harness.role } };
  return { state: { ...workspace, status: harness.status }, workspace: harness.status === "signed_out" ? null : workspace };
} }));
import { DraftNavigationProvider, DraftRouteBoundary } from "./DraftNavigationProvider";

type Element = ReactElement<Record<string, unknown>>;
function view() {
  const outer = DraftNavigationProvider({ children: "screen" }) as Element;
  if (harness.scope !== outer.key) {
    for (const cleanup of harness.cleanups) cleanup();
    harness.cleanups = []; harness.values = []; harness.scope = outer.key ?? "";
  }
  harness.cursor = 0;
  const result = (outer.type as (props: Record<string, unknown>) => ReactNode)(outer.props) as Element;
  for (const effect of harness.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
  const dialog = (result.props.children as Element[])[1];
  return { context: result.props.value as DraftNavigation, dialog,
    prevention: (result.props.children as Element[])[0].props.value };
}
beforeEach(() => {
  harness.values = []; harness.cursor = 0; harness.effects = []; harness.cleanups = []; harness.scope = "";
  harness.status = "ready"; harness.userId = "owner-a"; harness.restaurantId = "restaurant-a"; harness.role = "OWNER";
  harness.disable.mockReset();
  harness.contexts = [];
});

describe("open-form navigation review", () => {
  it("leaves immediately without edits and requires explicit discard for a dirty form", () => {
    const navigate = vi.fn();
    view().context.requestNavigation(navigate);
    expect(navigate).toHaveBeenCalledOnce();
    view().context.register("product", true);
    view().context.requestNavigation(navigate);
    let current = view();
    expect(harness.prevention).toBe(true);
    expect(current.dialog.props.visible).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
    (current.dialog.props.onCancel as () => void)();
    current = view();
    expect(current.dialog.props.visible).toBe(false);
    expect(harness.prevention).toBe(true);
    current.context.requestNavigation(navigate);
    (view().dialog.props.onConfirm as () => void)();
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(harness.disable).toHaveBeenCalledOnce();
    current.context.unregister("product");
    view(); expect(harness.prevention).toBe(false);
  });

  it("keeps protection when one of several open forms is saved or unmounted", () => {
    const context = view().context;
    context.register("product", true); context.register("palette", true);
    context.register("product", false);
    view(); expect(harness.prevention).toBe(true);
    context.unregister("palette");
    view(); expect(harness.prevention).toBe(false);
  });

  it("reviews a native back action and resumes exactly the blocked navigation", () => {
    view().context.register("zone", true); view();
    const repeat = vi.fn(); harness.prevented?.({ repeat });
    expect(repeat).not.toHaveBeenCalled();
    (view().dialog.props.onConfirm as () => void)();
    expect(repeat).toHaveBeenCalledOnce();
  });

  it("rearms protection for another dirty form retained by a local action", () => {
    const context = view().context;
    context.register("variant", true); context.register("photo", true);
    context.requestNavigation(() => context.unregister("variant"));
    (view().dialog.props.onConfirm as () => void)();
    view(); expect(harness.prevention).toBe(false);
    view(); expect(harness.prevention).toBe(true);
    const navigate = vi.fn(); context.requestNavigation(navigate);
    expect(view().dialog.props.visible).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("attaches removal review inside a nested route and releases both prevention hooks", () => {
    view().context.register("settings", true);
    const current = view();
    harness.contexts = [current.prevention, current.context];
    expect(DraftRouteBoundary({ children: "nested screen" })).toBe("nested screen");
    for (const effect of harness.effects.splice(0)) {
      const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup);
    }
    const repeat = vi.fn(); harness.prevented?.({ repeat });
    expect(repeat).not.toHaveBeenCalled();
    (view().dialog.props.onConfirm as () => void)();
    expect(repeat).toHaveBeenCalledOnce();
    expect(harness.disable).toHaveBeenCalledTimes(2);
  });

  it("retains drafts during membership checking while allowing access cleanup", () => {
    view().context.register("profile", true); view();
    harness.status = "checking_membership";
    const checking = view();
    expect(harness.prevention).toBe(false);
    const navigate = vi.fn(); checking.context.requestNavigation(navigate);
    expect(navigate).not.toHaveBeenCalled();
    harness.status = "ready"; view();
    expect(harness.prevention).toBe(true);
    harness.status = "signed_out"; view();
    expect(harness.prevention).toBe(false);
  });

  it.each(["user", "tenant", "role"])("drops queued navigation and draft state after a %s change", change => {
    view().context.register("team", true);
    const navigate = vi.fn(); view().context.requestNavigation(navigate);
    const staleConfirm = view().dialog.props.onConfirm as () => void;
    if (change === "user") harness.userId = "owner-b";
    if (change === "tenant") harness.restaurantId = "restaurant-b";
    if (change === "role") harness.role = "MANAGER";
    const current = view();
    expect(current.dialog.props.visible).toBe(false);
    expect(harness.prevention).toBe(false);
    staleConfirm();
    expect(navigate).not.toHaveBeenCalled();
  });
});
