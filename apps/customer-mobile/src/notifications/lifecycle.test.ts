import { describe, expect, it, vi } from "vitest";
import { createDeviceLifecycle, type DevicePort, type DeviceState } from "./lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
function fixture(initial: DeviceState = { optedInUser: null, activeDeviceId: null, associations: [] }) {
  let owner: string | null = "alice";
  let state = structuredClone(initial);
  const saved: DeviceState[] = [];
  const port: DevicePort = {
    currentUser: () => owner,
    load: vi.fn(async () => structuredClone(state)),
    save: vi.fn(async value => { state = structuredClone(value); saved.push(structuredClone(value)); }),
    register: vi.fn(async () => ({ id: "new-device" })),
    deactivate: vi.fn(async () => undefined),
    unregister: vi.fn(async () => undefined)
  };
  return { port, saved, lifecycle: createDeviceLifecycle(port), state: () => state, owner: (value: string | null) => { owner = value; } };
}
const enabled = (): DeviceState => ({ optedInUser: "alice", activeDeviceId: "old-device", associations: [{ userId: "alice", deviceId: "old-device" }] });

describe("customer device lifecycle", () => {
  it("requires opt-in and the current authenticated owner", async () => {
    const f = fixture();
    await expect(f.lifecycle.register("native-token", "alice")).rejects.toThrow("opt-in");
    await expect(f.lifecycle.register("native-token", "bob", true)).rejects.toThrow("account changed");
    expect(f.port.register).not.toHaveBeenCalled();
    await f.lifecycle.register("native-token", "alice", true);
    expect(f.port.register).toHaveBeenCalledWith("native-token", "alice");
    expect(f.state()).toEqual({ optedInUser: "alice", activeDeviceId: "new-device", associations: [{ userId: "alice", deviceId: "new-device" }] });
    expect(JSON.stringify(f.saved)).not.toContain("native-token");
  });

  it("keeps the new row durable at every stage of retiring an older token", async () => {
    const f = fixture(enabled());
    await f.lifecycle.register("rotated-token", "alice");
    expect(f.port.deactivate).toHaveBeenCalledExactlyOnceWith("old-device", "alice");
    expect(f.saved.every(state => state.associations.some(row => row.deviceId === "new-device"))).toBe(true);
    expect(f.state().associations).toEqual([{ userId: "alice", deviceId: "new-device" }]);
  });

  it("retains a failed retired row and retry leaves the active registration intact", async () => {
    const f = fixture(enabled());
    vi.mocked(f.port.deactivate).mockRejectedValueOnce(new Error("offline"));
    await f.lifecycle.register("rotated-token", "alice");
    expect(f.state().associations).toHaveLength(2);
    await f.lifecycle.retryCleanup();
    expect(f.port.deactivate).not.toHaveBeenCalledWith("new-device", "alice");
    expect(f.state().associations).toEqual([{ userId: "alice", deviceId: "new-device" }]);
    expect(f.port.unregister).not.toHaveBeenCalled();
  });

  it("stores logout intent before remote cleanup and preserves failures for that owner", async () => {
    const f = fixture(enabled());
    vi.mocked(f.port.deactivate).mockRejectedValue(new Error("offline"));
    await f.lifecycle.cleanup();
    expect(f.saved[0]).toEqual({ optedInUser: null, activeDeviceId: null, associations: enabled().associations });
    expect(f.state().associations).toEqual(enabled().associations);
    expect(f.port.unregister).toHaveBeenCalledOnce();
    vi.mocked(f.port.deactivate).mockResolvedValue(undefined);
    await f.lifecycle.retryCleanup();
    expect(f.state().associations).toEqual([]);
  });

  it("never cleans a foreign owner's pending device with a new account", async () => {
    const f = fixture({ ...enabled(), optedInUser: null, activeDeviceId: null });
    f.owner("bob");
    await expect(f.lifecycle.register("bob-token", "bob", true)).rejects.toThrow("previous account");
    await f.lifecycle.retryCleanup();
    expect(f.port.register).not.toHaveBeenCalled();
    expect(f.port.deactivate).not.toHaveBeenCalled();
    expect(f.state().associations).toEqual(enabled().associations);
  });

  it("serializes logout behind an in-flight registration and cleans its late result", async () => {
    const f = fixture();
    const response = deferred<{ id: string }>();
    const started = deferred<void>();
    vi.mocked(f.port.register).mockImplementation(async () => { started.resolve(); return response.promise; });
    const registration = f.lifecycle.register("native-token", "alice", true);
    const rejection = expect(registration).rejects.toThrow("account changed");
    await started.promise;
    const logout = f.lifecycle.cleanup();
    response.resolve({ id: "late-device" });
    await rejection;
    await logout;
    expect(f.state()).toEqual({ optedInUser: null, activeDeviceId: null, associations: [] });
    expect(f.port.deactivate).toHaveBeenCalledWith("late-device", "alice");
    await expect(f.lifecycle.register("late-rotation", "alice")).rejects.toThrow("stopped");
  });

  it("retains a late row when identity changed and never uses the new account to remove it", async () => {
    const f = fixture();
    const response = deferred<{ id: string }>();
    const started = deferred<void>();
    vi.mocked(f.port.register).mockImplementation(async () => { started.resolve(); return response.promise; });
    const registration = f.lifecycle.register("native-token", "alice", true);
    const rejection = expect(registration).rejects.toThrow("account changed");
    await started.promise;
    f.owner("bob");
    const cleanup = f.lifecycle.cleanup();
    response.resolve({ id: "late-device" });
    await rejection;
    await cleanup;
    expect(f.state()).toEqual({ optedInUser: null, activeDeviceId: null, associations: [{ userId: "alice", deviceId: "late-device" }] });
    expect(f.port.deactivate).not.toHaveBeenCalled();
    f.owner("alice");
    await f.lifecycle.retryCleanup();
    expect(f.state().associations).toEqual([]);
  });

  it("cancels a queued opt-in and permits a later explicit opt-in after cleanup", async () => {
    const f = fixture();
    const registration = f.lifecycle.register("first-token", "alice", true);
    const rejection = expect(registration).rejects.toThrow("account changed");
    const cleanup = f.lifecycle.cleanup();
    await rejection;
    await cleanup;
    expect(f.port.register).not.toHaveBeenCalled();
    await f.lifecycle.register("new-explicit-token", "alice", true);
    expect(f.state().optedInUser).toBe("alice");
  });

  it("does not retire a repeated current token's device row", async () => {
    const f = fixture(enabled());
    vi.mocked(f.port.register).mockResolvedValue({ id: "old-device" });
    await f.lifecycle.register("same-token", "alice");
    expect(f.port.deactivate).not.toHaveBeenCalled();
    expect(f.state().associations).toEqual(enabled().associations);
  });

  it("deactivates a new remote row if secure metadata cannot be saved", async () => {
    const f = fixture();
    vi.mocked(f.port.save).mockRejectedValue(new Error("secure storage unavailable"));
    await expect(f.lifecycle.register("native-token", "alice", true)).rejects.toThrow("secure storage");
    expect(f.port.deactivate).toHaveBeenCalledWith("new-device", "alice");
    expect(f.port.unregister).toHaveBeenCalledOnce();
  });
});
