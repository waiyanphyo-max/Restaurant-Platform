import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";

const harness = vi.hoisted(() => ({ cleanups: [] as (() => void)[], state: { status: "ready", userId: "owner", membership: { role: "OWNER" } }, signOut: vi.fn().mockResolvedValue(undefined), setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock("react", () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => { const setter = vi.fn(); harness.setters.push(setter); return [value, setter]; },
  useEffect: (effect: () => (() => void)) => { harness.cleanups.push(effect()); }
}));
vi.mock("../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: harness.state, signOut: harness.signOut }) }));
import { useApiMutation } from "./useApiMutation";

describe("mutation request lifecycle", () => {
  beforeEach(() => { harness.cleanups = []; harness.setters = []; harness.signOut.mockClear(); harness.state.status = "ready"; });
  it("blocks a second press while a real asynchronous mutation is unresolved", async () => {
    let resolve!: (value: string) => void;
    const action = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const saved = vi.fn(); const hook = useApiMutation();
    const first = hook.run(action, saved); await hook.run(action, saved);
    expect(action).toHaveBeenCalledTimes(1); resolve("saved"); await first;
    expect(saved).toHaveBeenCalledExactlyOnceWith("saved");
    await hook.run(async () => "next", saved); expect(saved).toHaveBeenCalledTimes(2);
  });
  it("discards late callbacks after the workspace unmounts", async () => {
    let resolve!: () => void; const saved = vi.fn(); const hook = useApiMutation();
    const work = hook.run(() => new Promise<void>(done => { resolve = done; }), saved);
    for (const cleanup of harness.cleanups) cleanup();
    resolve(); await work; expect(saved).not.toHaveBeenCalled();
    expect(harness.setters[2]).not.toHaveBeenCalledWith("Saved successfully.");
  });
  it("revokes an expired session but retains a record-specific denial", async () => {
    const hook = useApiMutation();
    await hook.run(async () => { throw new ApiHttpError(403, "DENIED"); });
    expect(harness.signOut).not.toHaveBeenCalled();
    await hook.run(async () => { throw new ApiHttpError(401, "EXPIRED"); });
    expect(harness.signOut).toHaveBeenCalledTimes(1);
  });
  it("does not retry a failed write and releases its duplicate guard", async () => {
    const hook = useApiMutation(); const action = vi.fn().mockRejectedValue(new ApiNetworkError());
    await hook.run(action); expect(action).toHaveBeenCalledTimes(1);
    const next = vi.fn().mockResolvedValue(undefined); await hook.run(next); expect(next).toHaveBeenCalledTimes(1);
  });
  it("does not start an action without verified workspace access", async () => {
    harness.state.status = "denied"; const hook = useApiMutation(); const action = vi.fn();
    await hook.run(action); expect(action).not.toHaveBeenCalled();
  });
});
