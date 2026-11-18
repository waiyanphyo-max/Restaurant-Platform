import { describe, expect, it, vi } from "vitest";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { ConfirmPurchaseInput } from "@restaurant-platform/shared-types";
import { createPurchaseAttemptStore, PurchaseAttemptStorageError, type PurchaseAttemptScope } from "./purchase-attempt";

const scope = { environment: "development", restaurantId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222" };
const body: ConfirmPurchaseInput = { purchaseDate: "2026-11-15", purchasedAt: "2026-11-15T10:00:00+06:30", supplierId: null,
  lines: [{ itemId: "33333333-3333-4333-8333-333333333333", quantity: "1.5", unit: "ပိဿာ", unitCost: "100" }], invoiceReference: "Receipt ၁" };
function fixture() {
  const records = new Map<string, string>();
  const storage = { getItemAsync: vi.fn(async (key: string) => records.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { records.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { records.delete(key); }) };
  return { records, storage, store: createPurchaseAttemptStore(scope, storage) };
}

describe("durable purchase submission recovery", () => {
  it("persists before returning, restores exact body/key after remount, and freezes against caller edits", async () => {
    const { store, storage } = fixture();
    const draft = structuredClone(body);
    const saving = store.begin(draft, "purchase-key");
    draft.lines[0].quantity = "99";
    const attempt = await saving;
    expect(storage.setItemAsync).toHaveBeenCalledOnce();
    expect(attempt.body).toEqual(body);
    expect(Object.isFrozen(attempt.body.lines[0])).toBe(true);
    const restored = await createPurchaseAttemptStore(scope, storage).load();
    expect(restored).toEqual({ version: 1, key: "purchase-key", body });
  });

  it("refuses a different body or key while an earlier purchase may have committed", async () => {
    const { store } = fixture();
    await store.begin(body, "original-key");
    await expect(store.begin({ ...body, purchasedAt: "2026-11-15T11:00:00+06:30" }, "changed-key")).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
    await expect(store.begin(body, "changed-key")).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
    expect(await store.begin(body, "original-key")).toEqual(await store.load());
  });

  it("serializes concurrent mounts and allows only one unresolved attempt", async () => {
    const { store, storage } = fixture();
    const other = createPurchaseAttemptStore(scope, storage);
    const results = await Promise.allSettled([store.begin(body, "first-key"), other.begin(body, "second-key")]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((await other.load())?.key).toBe("first-key");
  });

  it.each(["DATA_CONFLICT", "PURCHASE_CORRECTION_REQUIRES_CANCELLATION"])("releases the known rolled-back conflict %s so the draft can be corrected", async code => {
    const { store } = fixture(); await store.begin(body, "original-key");
    expect(await store.reject("original-key", new ApiHttpError(409, code))).toBe(true);
    expect(await store.load()).toBeNull();
  });

  it.each([409, 500, 503, 401])("retains an uncertain attempt for HTTP %i", async status => {
    const { store } = fixture(); await store.begin(body, "original-key");
    expect(await store.reject("original-key", new ApiHttpError(status, "FAILED"))).toBe(false);
    expect((await store.load())?.key).toBe("original-key");
  });

  it("retains network failures and clears only the matching confirmed attempt", async () => {
    const { store } = fixture(); await store.begin(body, "original-key");
    expect(await store.reject("original-key", new Error("connection lost"))).toBe(false);
    await expect(store.complete("wrong-key")).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
    expect(await store.load()).not.toBeNull();
    await store.complete("original-key"); expect(await store.load()).toBeNull();
  });

  it.each([400, 403, 404, 422])("clears a definitive transactional rejection for HTTP %i", async status => {
    const { store } = fixture(); await store.begin(body, "original-key");
    expect(await store.reject("original-key", new ApiHttpError(status, "REJECTED"))).toBe(true);
    expect(await store.load()).toBeNull();
  });

  it.each([
    { ...scope, userId: "44444444-4444-4444-8444-444444444444" },
    { ...scope, restaurantId: "55555555-5555-4555-8555-555555555555" },
    { ...scope, environment: "staging" },
  ])("isolates account/restaurant/environment scopes: %s", async otherScope => {
    const { store, storage } = fixture(); await store.begin(body, "original-key");
    const other = createPurchaseAttemptStore(otherScope, storage);
    expect(await other.load()).toBeNull();
    await other.complete("original-key");
    expect((await store.load())?.key).toBe("original-key");
  });

  it("fails closed for corrupt and foreign recovery records without deleting evidence", async () => {
    const { store, storage, records } = fixture(); await store.begin(body, "original-key");
    const key = [...records.keys()][0];
    records.set(key, "{corrupt");
    await expect(store.load()).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
    await expect(store.begin(body, "new-key")).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
    expect(storage.deleteItemAsync).not.toHaveBeenCalled();
    records.set(key, JSON.stringify({ version: 1, scope: { ...scope, userId: "44444444-4444-4444-8444-444444444444" }, key: "foreign-key", body }));
    await expect(store.load()).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
  });

  it("fails before network submission when secure persistence fails", async () => {
    const { store, storage } = fixture();
    storage.setItemAsync.mockRejectedValueOnce(new Error("native secure storage unavailable"));
    const network = vi.fn();
    await expect(store.begin(body, "original-key").then(network)).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
    expect(network).not.toHaveBeenCalled();
    expect(await store.load()).toBeNull();
  });

  it.each([
    { ...body, lines: [] },
    { ...body, lines: [{ ...body.lines[0], quantity: "0" }] },
    { ...body, lines: [{ ...body.lines[0], unitCost: "9223372036854775808" }] },
    { ...body, lines: [{ ...body.lines[0], itemId: "another/tenant" }] },
    { ...body, authorization: "never-persist-a-token" },
  ])("rejects malformed or credential-bearing recovery input", async invalid => {
    const { store, records } = fixture();
    await expect(store.begin(invalid, "original-key")).rejects.toBeInstanceOf(PurchaseAttemptStorageError);
    expect(records.size).toBe(0);
  });

  it("rejects invalid storage scope components", () => {
    const { storage } = fixture();
    expect(() => createPurchaseAttemptStore({ ...scope, userId: "unknown/user" } as PurchaseAttemptScope, storage)).toThrow(PurchaseAttemptStorageError);
  });
});
