import { ApiConfigurationError, ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApiQuery } from "./useApiQuery";

const harness = vi.hoisted(() => ({
  effect: undefined as (() => () => void) | undefined,
  setState: vi.fn(),
  signOut: vi.fn(async () => undefined)
}));

vi.mock("react", () => ({
  useCallback: <T,>(callback: T) => callback,
  useEffect: (effect: () => () => void) => { harness.effect = effect; },
  useRef: <T,>(value: T) => ({ current: value }),
  useState: <T,>(value: T) => [value, harness.setState]
}));

vi.mock("../auth/AuthProvider", () => ({
  useOperationsAuth: () => ({
    state: { status: "ready", userId: "test-member", membership: { role: "OWNER" } },
    signOut: harness.signOut
  })
}));

function startQuery(query: (signal: AbortSignal) => Promise<unknown>) {
  useApiQuery(query, "financial-records");
  if (!harness.effect) throw new Error("Query did not register a load effect");
  return harness.effect();
}

describe("useApiQuery", () => {
  beforeEach(() => { vi.clearAllMocks(); harness.effect = undefined; });

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
});
