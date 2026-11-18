import { ApiConfigurationError, ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApiQuery } from "./useApiQuery";

const harness = vi.hoisted(() => ({
  effect: undefined as (() => () => void) | undefined,
  dependencies: undefined as unknown[] | undefined,
  states: [] as unknown[], refs: [] as unknown[], stateCursor: 0, refCursor: 0,
  cleanup: undefined as (() => void) | undefined,
  identity: { status: "ready", userId: "test-member", role: "OWNER", restaurantId: "restaurant-a" },
  setState: vi.fn(),
  signOut: vi.fn(async () => undefined)
}));

vi.mock("react", () => ({
  useCallback: <T,>(callback: T) => callback,
  useEffect: (effect: () => () => void, dependencies: unknown[]) => {
    if (!harness.dependencies || dependencies.some((value, index) => value !== harness.dependencies?.[index])) {
      harness.dependencies = dependencies; harness.effect = effect;
    }
  },
  useRef: <T,>(value: T) => {
    const index = harness.refCursor++;
    harness.refs[index] ??= { current: value };
    return harness.refs[index] as { current: T };
  },
  useState: <T,>(value: T) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = value;
    return [harness.states[index], (next: T | ((value: T) => T)) => {
      harness.states[index] = typeof next === "function" ? (next as (value: T) => T)(harness.states[index] as T) : next;
      harness.setState(next);
    }];
  }
}));

vi.mock("../auth/AuthProvider", () => ({
  useOperationsAuth: () => ({
    state: { status: harness.identity.status, userId: harness.identity.userId,
      membership: { role: harness.identity.role, restaurantId: harness.identity.restaurantId } },
    signOut: harness.signOut
  })
}));

function startQuery(query: (signal: AbortSignal) => Promise<unknown>) {
  harness.stateCursor = 0; harness.refCursor = 0;
  useApiQuery(query, "financial-records");
  if (!harness.effect) throw new Error("Query did not register a load effect");
  return harness.effect();
}

describe("useApiQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks(); harness.effect = undefined; harness.dependencies = undefined;
    harness.states = []; harness.refs = []; harness.stateCursor = 0; harness.refCursor = 0; harness.cleanup = undefined;
    harness.identity = { status: "ready", userId: "test-member", role: "OWNER", restaurantId: "restaurant-a" };
  });

  it("maps synchronous request validation to the retryable error state", () => {
    startQuery(() => { throw new ApiConfigurationError("Invalid financial period"); });
    expect(harness.setState).toHaveBeenLastCalledWith(expect.objectContaining({ state: { status: "error" } }));
  });

  it.each([
    { error: new ApiNetworkError(), status: "offline", signOut: false },
    { error: new ApiHttpError(403, "INSUFFICIENT_RESTAURANT_PERMISSION"), status: "denied", signOut: false },
    { error: new ApiHttpError(401, "AUTHENTICATION_REQUIRED"), status: "denied", signOut: true }
  ])("handles a rejected financial request as $status", async ({ error, status, signOut }) => {
    startQuery(async () => { throw error; });
    await Promise.resolve();
    expect(harness.setState).toHaveBeenLastCalledWith(expect.objectContaining({ state: { status } }));
    expect(harness.signOut).toHaveBeenCalledTimes(signOut ? 1 : 0);
  });

  it("discards a financial result that arrives after the screen unmounts", async () => {
    let resolveResult!: (value: string) => void;
    const pending = new Promise<string>(resolve => { resolveResult = resolve; });
    const query = vi.fn<(signal: AbortSignal) => Promise<string>>(() => pending);
    const stop = startQuery(query);
    stop();
    resolveResult("financial result");
    await pending;
    expect(query.mock.calls[0][0].aborted).toBe(true);
    expect(harness.setState).toHaveBeenCalledTimes(1);
    expect(harness.setState).toHaveBeenLastCalledWith(expect.objectContaining({ state: { status: "loading" } }));
  });

  function render<T>(query: (signal: AbortSignal) => Promise<T>, key = "menu", keepPreviousData = true) {
    harness.stateCursor = 0; harness.refCursor = 0; harness.effect = undefined;
    const result = useApiQuery(query, key, { keepPreviousData });
    if (harness.effect) {
      harness.cleanup?.();
      harness.cleanup = (harness.effect as () => () => void)();
    }
    return result;
  }

  it("keeps the selected product's data mounted through an explicit refresh", async () => {
    const original: { products: { id: string; imageUrl: string | null }[] } = { products: [{ id: "selected-product", imageUrl: null }] };
    let finish!: (value: typeof original) => void;
    const query = vi.fn().mockResolvedValueOnce(original).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(query);
    await Promise.resolve();
    let view = render(query);
    expect(view.state).toEqual({ status: "ready", data: original });
    view.reload();
    view = render(query);
    expect(view.state).toEqual({ status: "ready", data: original });
    expect(view.refreshing).toBe(true);
    // The product component remains the same ready child while the image URL reloads.
    const updated = { products: [{ id: "selected-product", imageUrl: "https://media.example.test/product.png" }] };
    finish(updated);
    await Promise.resolve();
    view = render(query);
    expect(view.state).toEqual({ status: "ready", data: updated });
    expect(view.refreshing).toBe(false);
  });

  it("keeps the previous data and a readable refresh failure after a successful write", async () => {
    const data = { id: "selected-product" };
    const query = vi.fn().mockResolvedValueOnce(data).mockRejectedValueOnce(new ApiNetworkError());
    render(query); await Promise.resolve();
    render(query).reload(); render(query); await Promise.resolve();
    const view = render(query);
    expect(view.state).toEqual({ status: "ready", data });
    expect(view.refreshError).toBe("offline");
    expect(view.refreshing).toBe(false);
  });

  it.each([401, 403])("discards retained records immediately when refresh authorization fails with %s", async status => {
    const query = vi.fn().mockResolvedValueOnce({ id: "private-product" }).mockRejectedValueOnce(new ApiHttpError(status, "DENIED"));
    render(query); await Promise.resolve();
    render(query).reload(); render(query); await Promise.resolve();
    expect(render(query).state).toEqual({ status: "denied" });
    expect(harness.signOut).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it.each(["user", "role", "tenant", "query", "signed-out"])("never carries records across a %s scope change", async change => {
    const query = vi.fn().mockResolvedValueOnce({ secret: "old-product" }).mockImplementation(() => new Promise(() => {}));
    render(query); await Promise.resolve();
    expect(render(query).state.status).toBe("ready");
    if (change === "user") harness.identity.userId = "another-member";
    if (change === "role") harness.identity.role = "STAFF";
    if (change === "tenant") harness.identity.restaurantId = "restaurant-b";
    if (change === "signed-out") harness.identity.status = "signed_out";
    expect(render(query, change === "query" ? "another-menu" : "menu").state).toEqual({ status: "loading" });
  });

  it("preserves default loading behavior for callers that did not opt in", async () => {
    const query = vi.fn().mockResolvedValueOnce({ id: "record" }).mockImplementation(() => new Promise(() => {}));
    render(query, "records", false); await Promise.resolve();
    render(query, "records", false).reload();
    expect(render(query, "records", false).state).toEqual({ status: "loading" });
  });
});
