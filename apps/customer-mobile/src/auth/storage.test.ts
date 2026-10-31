import { describe, expect, it, vi } from "vitest";
import { createSecureSessionStorage, type SecureStoragePort } from "./storage";

function setup() {
  const values = new Map<string, string>();
  const store: SecureStoragePort = {
    getItemAsync: vi.fn(async (key) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key, value) => { values.set(key, value); }),
    deleteItemAsync: vi.fn(async (key) => { values.delete(key); })
  };
  return { values, store };
}

describe("encrypted session storage adapter", () => {
  it("persists/restores/removes a session through the secure store port", async () => {
    const { store } = setup();
    const storage = createSecureSessionStorage("rp.operations.staging.restaurant.project.443", store);
    await storage.setItem("auth-token", "session-fixture");
    expect(await storage.getItem("auth-token")).toBe("session-fixture");
    await storage.removeItem("auth-token");
    expect(await storage.getItem("auth-token")).toBeNull();
  });

  it("isolates product/environment scopes and rejects unsafe storage keys", async () => {
    const { store } = setup();
    const operations = createSecureSessionStorage("rp.operations.staging.restaurant.project.443", store);
    const customer = createSecureSessionStorage("rp.customer.production.restaurant.project.443", store);
    await operations.setItem("auth-token", "session-fixture");
    expect(await customer.getItem("auth-token")).toBeNull();
    expect(() => operations.getItem("../auth-token")).toThrow("Unexpected auth storage key");
    expect(() => createSecureSessionStorage("invalid/scope", store)).toThrow("Invalid auth storage scope");
  });

  it("propagates native persistence failures without a plaintext fallback", async () => {
    const { store, values } = setup();
    const failure = new Error("secure store unavailable");
    store.setItemAsync = vi.fn(async () => { throw failure; });
    const storage = createSecureSessionStorage("rp.operations.staging.restaurant.project.443", store);
    await expect(storage.setItem("auth-token", "session-fixture")).rejects.toBe(failure);
    expect(values.size).toBe(0);
    expect(await storage.getItem("auth-token")).toBeNull();
  });
});
