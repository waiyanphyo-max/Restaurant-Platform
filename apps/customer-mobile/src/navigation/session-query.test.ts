import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";

const harness = vi.hoisted(() => ({
  auth: { status: "signed_in", userId: "customer-a" },
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as { dependencies: unknown[]; cleanup(): void }[],
  stateIndex: 0, refIndex: 0, effectIndex: 0
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value;
    }];
  },
  useRef(initial: unknown) {
    const index = harness.refIndex++; harness.refs[index] ??= { current: initial }; return harness.refs[index];
  },
  useCallback: (callback: unknown) => callback,
  useEffect(effect: () => (() => void), dependencies: unknown[]) {
    const index = harness.effectIndex++; const previous = harness.effects[index];
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) {
      previous?.cleanup(); harness.effects[index] = { dependencies, cleanup: effect() };
    }
  }
}));
vi.mock("../auth/AuthProvider", () => ({ useCustomerAuth: () => ({ state: harness.auth }) }));
import { queryFailure, useApiQuery } from "../hooks/useApiQuery";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function render<T>(query: (signal: AbortSignal) => Promise<T>, key = "account") {
  harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
  return useApiQuery(query, key);
}

describe("customer session navigation data boundaries", () => {
  beforeEach(() => {
    for (const effect of harness.effects) effect.cleanup();
    harness.states = []; harness.refs = []; harness.effects = [];
    harness.auth = { status: "signed_in", userId: "customer-a" };
  });

  it("waits for authentication restoration before requesting private account data", async () => {
    harness.auth.status = "loading"; const query = vi.fn().mockResolvedValue("private-profile");
    expect(render(query).state).toEqual({ status: "loading" }); await tick();
    expect(query).not.toHaveBeenCalled();
    harness.auth.status = "signed_in";
    expect(render(query).state).toEqual({ status: "loading" }); await tick();
    expect(render(query).state).toEqual({ status: "ready", data: "private-profile" });
  });

  it("hides customer A data immediately on customer B session transition", async () => {
    const query = vi.fn().mockResolvedValue("customer-a-private-address");
    render(query); await tick(); expect(render(query).state.status).toBe("ready");
    harness.auth.userId = "customer-b"; query.mockResolvedValue("customer-b-private-address");
    expect(render(query).state).toEqual({ status: "loading" }); await tick();
    expect(render(query).state).toEqual({ status: "ready", data: "customer-b-private-address" });
  });

  it("aborts and discards a late customer A address response after the identity changes", async () => {
    let finishA!: (value: string) => void;
    const query = vi.fn<(signal: AbortSignal) => Promise<string>>().mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
      .mockResolvedValue("customer-b");
    render(query); const oldSignal = query.mock.calls[0][0];
    harness.auth.userId = "customer-b"; render(query); await tick();
    expect(oldSignal.aborted).toBe(true);
    finishA("customer-a-private-location"); await tick();
    expect(render(query).state).toEqual({ status: "ready", data: "customer-b" });
  });

  it("clears visible private data as soon as logout begins", async () => {
    const query = vi.fn().mockResolvedValue("private-address"); render(query); await tick();
    expect(render(query).state.status).toBe("ready");
    harness.auth.status = "signed_out"; expect(render(query).state).toEqual({ status: "loading" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("supports an explicit retry after an offline error without preserving old private data", async () => {
    const query = vi.fn().mockRejectedValueOnce(new ApiNetworkError()).mockResolvedValue("saved-home");
    render(query); await tick(); const offline = render(query); expect(offline.state).toEqual({ status: "offline" });
    offline.reload(); expect(render(query).state).toEqual({ status: "loading" }); await tick();
    expect(render(query).state).toEqual({ status: "ready", data: "saved-home" });
  });

  it.each([
    [new MissingAccessTokenError(), "denied"], [new ApiHttpError(401, "EXPIRED"), "denied"],
    [new ApiHttpError(403, "DENIED"), "denied"], [new ApiNetworkError(), "offline"],
    [new ApiTimeoutError(), "offline"], [new ApiProtocolError(), "error"], [new ApiHttpError(500, "FAILURE"), "error"]
  ])("classifies private API failures without displaying raw error messages: %s", (error, expected) => {
    expect(queryFailure(error)).toBe(expected);
  });
});
