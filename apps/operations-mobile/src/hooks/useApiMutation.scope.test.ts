import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError } from "@restaurant-platform/api-client";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as unknown[], stateCursor: 0, refCursor: 0, rendersRequested: 0,
  identity: { status: "ready", userId: "member-a", restaurantId: "restaurant-a", role: "OWNER" },
  signOut: vi.fn(async () => undefined),
}));
vi.mock("react", () => ({
  useRef: <T,>(initial: T) => {
    const index = harness.refCursor++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index] as { current: T };
  },
  useState: <T,>(initial: T) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: T) => {
      if (Object.is(harness.states[index], next)) return;
      harness.states[index] = next; harness.rendersRequested++;
    }];
  },
  useEffect: () => undefined,
}));
vi.mock("../auth/AuthProvider", () => ({ useOperationsAuth: () => ({
  state: { status: harness.identity.status, userId: harness.identity.userId,
    membership: { restaurantId: harness.identity.restaurantId, role: harness.identity.role } },
  signOut: harness.signOut,
}) }));
import { useApiMutation } from "./useApiMutation";

function render() {
  harness.stateCursor = 0; harness.refCursor = 0;
  return useApiMutation();
}
beforeEach(() => {
  harness.states = []; harness.refs = []; harness.rendersRequested = 0; harness.signOut.mockClear();
  harness.identity = { status: "ready", userId: "member-a", restaurantId: "restaurant-a", role: "OWNER" };
});

describe("mutation scope revocation", () => {
  it("renders busy for a fresh scope after an old pending action settles", async () => {
    let finishOld!: () => void;
    const oldPending = render().run(() => new Promise<void>(resolve => { finishOld = resolve; }));
    expect(render().busy).toBe(true);
    harness.identity.restaurantId = "restaurant-b";
    expect(render().busy).toBe(false);
    finishOld(); await oldPending;
    const fresh = render(); const rendersBefore = harness.rendersRequested;
    let finishFresh!: () => void;
    const freshPending = fresh.run(() => new Promise<void>(resolve => { finishFresh = resolve; }));
    expect(harness.rendersRequested).toBeGreaterThan(rendersBefore);
    expect(render().busy).toBe(true);
    finishFresh(); await freshPending;
    expect(render().busy).toBe(false);
  });
  it.each(["user", "role", "tenant", "session"])("discards late success across a %s change", async change => {
    let finish!: () => void;
    const old = render(); const saved = vi.fn();
    const pending = old.run(() => new Promise<void>(resolve => { finish = resolve; }), saved);
    if (change === "user") harness.identity.userId = "member-b";
    if (change === "role") harness.identity.role = "STAFF";
    if (change === "tenant") harness.identity.restaurantId = "restaurant-b";
    if (change === "session") harness.identity.status = "signed_out";
    expect(render()).toMatchObject({ busy: false, error: null, message: null });
    finish(); await pending;
    expect(saved).not.toHaveBeenCalled();
    expect(render().message).toBeNull();
  });

  it("revokes a stale submit callback even when the original tenant returns", async () => {
    const original = render();
    harness.identity.restaurantId = "restaurant-b"; render();
    harness.identity.restaurantId = "restaurant-a"; const fresh = render();
    const action = vi.fn(async () => "server-confirmed");
    await original.run(action); expect(action).not.toHaveBeenCalled();
    await fresh.run(action); expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not sign out a new identity because an old request later returns 401", async () => {
    let fail!: (error: unknown) => void;
    const failure = vi.fn();
    const pending = render().run(() => new Promise((_resolve, reject) => { fail = reject; }), undefined, failure);
    harness.identity.userId = "member-b"; render();
    fail(new ApiHttpError(401, "EXPIRED")); await pending;
    expect(harness.signOut).not.toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled();
  });

  it("does not show saved feedback from another restaurant", async () => {
    await render().run(async () => "confirmed");
    expect(render().message).toBe("Saved successfully.");
    harness.identity.restaurantId = "restaurant-b";
    expect(render()).toMatchObject({ busy: false, error: null, message: null });
  });
});
