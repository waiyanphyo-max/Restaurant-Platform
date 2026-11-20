import { describe, expect, it, vi } from "vitest";
import { createProvisioningAttemptStore } from "./provisioning-attempt";

const scope = { apiOrigin: "https://api.example.test", userId: "11111111-1111-4111-8111-111111111111" };
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe("unresolved provisioning recovery", () => {
  it("retains a slug-only marker before dispatch and across reloads", () => {
    const storage = memoryStorage();
    const attempt = createProvisioningAttemptStore(storage, scope);
    expect(attempt.read()).toBeNull();
    attempt.begin("reviewed-new-restaurant");
    expect(createProvisioningAttemptStore(storage, scope).read()).toBe("reviewed-new-restaurant");
    expect([...storage.values.values()]).toEqual(['{"version":1,"slug":"reviewed-new-restaurant"}']);
    expect(() => attempt.begin("another-restaurant")).toThrow("Reconcile");
  });

  it("isolates API environments and verified Admin identities", () => {
    const storage = memoryStorage();
    createProvisioningAttemptStore(storage, scope).begin("restaurant-a");
    expect(createProvisioningAttemptStore(storage, { ...scope, apiOrigin: "https://staging-api.example.test" }).read()).toBeNull();
    expect(createProvisioningAttemptStore(storage, { ...scope, userId: "22222222-2222-4222-8222-222222222222" }).read()).toBeNull();
  });

  it("can clear a reconciled/confirmed attempt before another reviewed creation", () => {
    const storage = memoryStorage(), attempt = createProvisioningAttemptStore(storage, scope);
    attempt.begin("restaurant-a"); attempt.clear();
    expect(attempt.read()).toBeNull();
    attempt.begin("restaurant-b"); expect(attempt.read()).toBe("restaurant-b");
  });

  it("fails closed when storage cannot retain or read the marker", () => {
    const unavailable = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(() => createProvisioningAttemptStore(unavailable, scope).begin("restaurant-a")).toThrow("storage");
    const dispatch = vi.fn();
    const denied = { ...unavailable, setItem: () => { throw new Error("Storage denied"); } };
    expect(() => { createProvisioningAttemptStore(denied, scope).begin("restaurant-a"); dispatch(); }).toThrow("denied");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects corrupted recovery state without silently erasing uncertainty", () => {
    const storage = memoryStorage(), attempt = createProvisioningAttemptStore(storage, scope);
    attempt.begin("restaurant-a");
    for (const key of storage.values.keys()) storage.values.set(key, '{"slug":"restaurant-a"}');
    expect(() => attempt.read()).toThrow("reconciled");
    expect(() => attempt.begin("restaurant-b")).toThrow("reconciled");
    expect(storage.values.size).toBe(1);
  });
});
