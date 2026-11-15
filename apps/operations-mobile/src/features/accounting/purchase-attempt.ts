import { ApiHttpError } from "@restaurant-platform/api-client";
import type { ConfirmPurchaseInput } from "@restaurant-platform/shared-types";
import type { SecureStoragePort } from "../../auth/storage";
import { isIsoDate } from "../operations/format";
import { purchaseQuantity, purchaseTimestamp, purchaseWholeAmount } from "./procurement-format";

export interface PurchaseAttemptScope { environment: string; restaurantId: string; userId: string; }
export interface PurchaseAttempt { version: 1; key: string; body: ConfirmPurchaseInput; }
type StoredAttempt = PurchaseAttempt & { scope: PurchaseAttemptScope };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const queues = new Map<string, Promise<unknown>>();
const bodyFields = ["purchaseDate", "purchasedAt", "supplierId", "lines", "sheetId", "dueDate", "receiptId", "invoiceReference", "correctionOfId", "correctionReason"];

export class PurchaseAttemptStorageError extends Error {
  constructor() { super("The pending purchase could not be read or saved securely. Resolve storage access before recording another purchase."); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseAttemptStorageError();
  return value as Record<string, unknown>;
}
function only(value: Record<string, unknown>, fields: readonly string[]) {
  if (Object.keys(value).some(key => !fields.includes(key))) throw new PurchaseAttemptStorageError();
}
function optionalUuid(value: unknown) { if (value != null && (typeof value !== "string" || !uuid.test(value))) throw new PurchaseAttemptStorageError(); }
function optionalText(value: unknown, maximum: number) { if (value != null && (typeof value !== "string" || value.length > maximum)) throw new PurchaseAttemptStorageError(); }
function isoDate(value: unknown) {
  if (typeof value !== "string" || !isIsoDate(value) || value < "1900-01-01" || value > "9998-12-31") throw new PurchaseAttemptStorageError();
}

function checkedBody(value: unknown): ConfirmPurchaseInput {
  try {
    const body = record(value);
    only(body, bodyFields);
    isoDate(body.purchaseDate);
    if (typeof body.purchasedAt !== "string") throw new PurchaseAttemptStorageError();
    purchaseTimestamp(body.purchasedAt);
    for (const name of ["supplierId", "sheetId", "receiptId", "correctionOfId"]) optionalUuid(body[name]);
    if (body.dueDate != null) isoDate(body.dueDate);
    optionalText(body.invoiceReference, 150); optionalText(body.correctionReason, 1000);
    if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 200) throw new PurchaseAttemptStorageError();
    for (const value of body.lines) {
      const line = record(value);
      only(line, ["itemId", "quantity", "unit", "unitCost", "supplierId"]);
      if (typeof line.itemId !== "string" || !uuid.test(line.itemId) || typeof line.quantity !== "string" || typeof line.unitCost !== "string"
        || typeof line.unit !== "string" || !line.unit.trim() || line.unit.length > 30) throw new PurchaseAttemptStorageError();
      purchaseQuantity(line.quantity); purchaseWholeAmount(line.unitCost); optionalUuid(line.supplierId);
    }
    return body as unknown as ConfirmPurchaseInput;
  } catch { throw new PurchaseAttemptStorageError(); }
}

function immutable(attempt: PurchaseAttempt): PurchaseAttempt {
  for (const line of attempt.body.lines) Object.freeze(line);
  Object.freeze(attempt.body.lines); Object.freeze(attempt.body);
  return Object.freeze(attempt);
}

/** Only errors known to reject the transaction permit editing a new draft. */
export function isDefinitivePurchaseRejection(error: unknown): boolean {
  return error instanceof ApiHttpError && ([400, 403, 404, 422].includes(error.status)
    // These conflicts are emitted after the transaction rejects/rolls back a
    // new purchase. Releasing them lets a stale source plan be corrected.
    || error.status === 409 && ["DATA_CONFLICT", "PURCHASE_CORRECTION_REQUIRES_CANCELLATION"].includes(error.code));
}

/** Durable exact-body/key recovery. No bearer tokens or provider credentials are stored. */
export function createPurchaseAttemptStore(input: PurchaseAttemptScope, storage: SecureStoragePort) {
  if (!["development", "staging", "production"].includes(input.environment) || !uuid.test(input.restaurantId) || !uuid.test(input.userId)) throw new PurchaseAttemptStorageError();
  const scope = Object.freeze({ environment: input.environment, restaurantId: input.restaurantId.toLowerCase(), userId: input.userId.toLowerCase() });
  const storageKey = `rp.operations.purchase-attempt.v1.${scope.environment}.${scope.restaurantId}.${scope.userId}`;

  function serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = (queues.get(storageKey) ?? Promise.resolve()).then(action);
    const tail = result.catch(() => undefined);
    queues.set(storageKey, tail);
    void tail.then(() => { if (queues.get(storageKey) === tail) queues.delete(storageKey); });
    return result;
  }
  function decode(raw: string): PurchaseAttempt {
    try {
      if (raw.length > 200_000) throw new PurchaseAttemptStorageError();
      const entry = record(JSON.parse(raw));
      only(entry, ["version", "scope", "key", "body"]);
      const savedScope = record(entry.scope);
      only(savedScope, ["environment", "restaurantId", "userId"]);
      if (entry.version !== 1 || savedScope.environment !== scope.environment || savedScope.restaurantId !== scope.restaurantId || savedScope.userId !== scope.userId
        || typeof entry.key !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(entry.key)) throw new PurchaseAttemptStorageError();
      return immutable({ version: 1, key: entry.key, body: checkedBody(entry.body) });
    } catch { throw new PurchaseAttemptStorageError(); }
  }
  async function read(): Promise<PurchaseAttempt | null> {
    try { const raw = await storage.getItemAsync(storageKey); return raw === null ? null : decode(raw); }
    catch { throw new PurchaseAttemptStorageError(); }
  }
  async function clear(key: string): Promise<void> {
    const previous = await read();
    if (previous && previous.key !== key) throw new PurchaseAttemptStorageError();
    try { await storage.deleteItemAsync(storageKey); } catch { throw new PurchaseAttemptStorageError(); }
  }
  return {
    load: () => serialize(read),
    begin(body: ConfirmPurchaseInput, key: string): Promise<PurchaseAttempt> {
      // Capture before awaiting storage: subsequent input changes cannot alter this attempt.
      let entry: string;
      try {
        entry = JSON.stringify({ version: 1, scope, key, body } satisfies StoredAttempt);
        decode(entry);
      } catch { return Promise.reject(new PurchaseAttemptStorageError()); }
      return serialize(async () => {
        const candidate = decode(entry);
        const previous = await read();
        if (previous) {
          if (previous.key !== candidate.key || JSON.stringify(previous.body) !== JSON.stringify(candidate.body)) throw new PurchaseAttemptStorageError();
          return previous;
        }
        try { await storage.setItemAsync(storageKey, entry); } catch { throw new PurchaseAttemptStorageError(); }
        return candidate;
      });
    },
    complete: (key: string) => serialize(() => clear(key)),
    reject(key: string, error: unknown): Promise<boolean> {
      if (!isDefinitivePurchaseRejection(error)) return Promise.resolve(false);
      return serialize(async () => { await clear(key); return true; });
    },
  };
}

export type PurchaseAttemptStore = ReturnType<typeof createPurchaseAttemptStore>;
