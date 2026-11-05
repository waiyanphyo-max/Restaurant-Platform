import { describe, expect, it, vi } from "vitest";
import { createLogoutProtectedSessionStorage, createSecureSessionStorage, type SecureStoragePort } from "./storage";

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

describe("durable local logout storage", () => {
  const scope = "rp.operations.staging.restaurant.project.443";
  const sessionKey = "operations-auth-session";

  it("erases credentials after offline SDK logout and cannot restore them after restart", async () => {
    const { store, values } = setup();
    const storage = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    await storage.setItem(sessionKey, "encrypted-session-fixture");
    await storage.signOut(async () => { throw new Error("network unavailable"); });
    expect(values.has(`${scope}.${sessionKey}`)).toBe(false);
    const restarted = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    expect(await restarted.getItem(sessionKey)).toBeNull();
    await restarted.setItem(sessionKey, "stale-auto-refresh-fixture");
    expect(values.has(`${scope}.${sessionKey}`)).toBe(false);
  });

  it("persists the barrier before remote logout and blocks restoration even if interrupted before erasure", async () => {
    const { store } = setup();
    const storage = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    await storage.setItem(sessionKey, "encrypted-session-fixture");
    let finish!: () => void;
    const signingOut = storage.signOut(() => new Promise<void>(resolve => { finish = resolve; }));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const restarted = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    expect(await restarted.getItem(sessionKey)).toBeNull();
    // The existing SDK may still read its token to revoke it, but cannot persist a refresh.
    expect(await storage.getItem(sessionKey)).toBe("encrypted-session-fixture");
    await storage.setItem(sessionKey, "late-refresh-fixture");
    finish();
    await signingOut;
    expect(await storage.getItem(sessionKey)).toBeNull();
  });

  it("clears stale keys before permitting a new explicit password sign-in", async () => {
    const { store, values } = setup();
    const storage = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    await storage.setItem(sessionKey, "old-session-fixture");
    await storage.signOut(async () => {});
    // Model a credential left behind by a platform deletion interruption.
    values.set(`${scope}.${sessionKey}`, "old-session-fixture");
    const restarted = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    expect(await restarted.getItem(sessionKey)).toBeNull();
    await restarted.prepareSignIn();
    expect(await restarted.getItem(sessionKey)).toBeNull();
    await restarted.setItem(sessionKey, "new-session-fixture");
    const nextRestart = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    expect(await nextRestart.getItem(sessionKey)).toBe("new-session-fixture");
  });

  it("preserves the durable barrier when encrypted credential deletion fails", async () => {
    const { store } = setup();
    const storage = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    await storage.setItem(sessionKey, "session-fixture");
    store.deleteItemAsync = vi.fn(async () => { throw new Error("secure deletion failed"); });
    await expect(storage.signOut(async () => {})).rejects.toThrow("secure deletion failed");
    expect(await storage.getItem(sessionKey)).toBeNull();
    expect(await createLogoutProtectedSessionStorage(scope, store, sessionKey).getItem(sessionKey)).toBeNull();
    await expect(storage.prepareSignIn()).rejects.toThrow("secure deletion failed");
  });

  it("reports failure to persist a logout barrier instead of silently claiming durable logout", async () => {
    const { store } = setup();
    const storage = createLogoutProtectedSessionStorage(scope, store, sessionKey);
    await storage.setItem(sessionKey, "session-fixture");
    store.setItemAsync = vi.fn(async () => { throw new Error("secure write failed"); });
    await expect(storage.signOut(async () => {})).rejects.toThrow("secure write failed");
    expect(await storage.getItem(sessionKey)).toBeNull();
  });
});
