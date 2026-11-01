import type { CreateOrderItemRequest, CreateOrderResponse, MenuProductDto, ModifierSelectionRequest, NotificationResponse, QueueTrackingResponse } from "@restaurant-platform/shared-types";
import { isProductAvailable } from "./menu";

export type QrKind = "COMMON_QR" | "TABLE_QR";
export type GuestError = "invalid-qr" | "unavailable" | "selection" | "conflict" | "retry" | "configuration" | "expired";
export interface QrContext { restaurantId: string; kind: QrKind; tableId: string | null; tableNumber: string | null; }
export interface ItemSelection { variantId?: string | null; quantity: number; specialInstruction?: string; modifiers?: ModifierSelectionRequest[]; }
export interface CartLine extends CreateOrderItemRequest {
  id: string; name: string; variantId: string | null; variantName: string | null;
  specialInstruction: string; modifiers: ModifierSelectionRequest[]; modifierNames: string[];
}
export type GuestReceipt = Omit<CreateOrderResponse, "queue"> & { queue: Omit<NonNullable<CreateOrderResponse["queue"]>, "trackingToken"> | null };
export interface GuestOrderState {
  phase: "browse" | "validating" | "ready" | "invalid" | "error" | "submitting" | "uncertain" | "confirmed";
  kind: QrKind | null; context: QrContext | null; cart: CartLine[]; receipt: GuestReceipt | null;
  tracking: QueueTrackingResponse | null; notifications: NotificationResponse[];
  error: GuestError | null; trackingError: boolean; sound: "off" | "on" | "unavailable";
}
export const initialOrderState: GuestOrderState = {
  phase: "validating", kind: null, context: null, cart: [], receipt: null,
  tracking: null, notifications: [], error: null, trackingError: false, sound: "off",
};
type Envelope<T> = { ok: true; data: T } | { ok: false; error: GuestError; ambiguous: boolean; retryable: boolean };
export type GuestRequest = <T>(body: Record<string, unknown>) => Promise<Envelope<T>>;
interface PendingCheckout { key: string; createdAt: number; kind: QrKind; tableId: string | null; tableNumber: string | null; items: CreateOrderItemRequest[]; cart: CartLine[]; }
interface RecoveryStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validRecovery(value: unknown, kind: QrKind): value is PendingCheckout {
  if (!value || typeof value !== "object") return false;
  const p = value as PendingCheckout;
  if (p.kind !== kind || typeof p.key !== "string" || !/^[a-zA-Z0-9-]{16,128}$/.test(p.key) || !Number.isSafeInteger(p.createdAt) || p.createdAt > Date.now() ||
      (kind === "COMMON_QR" ? p.tableId !== null : typeof p.tableId !== "string" || !uuidPattern.test(p.tableId)) ||
      (p.tableNumber !== null && typeof p.tableNumber !== "string") || !Array.isArray(p.items) || !p.items.length || p.items.length > 50 || !Array.isArray(p.cart) || p.cart.length !== p.items.length) return false;
  return p.cart.every((line, index) => {
    if (!line || typeof line !== "object" || typeof line.id !== "string" || !line.id || typeof line.name !== "string" ||
        !uuidPattern.test(line.productId) || (line.variantId !== null && (typeof line.variantId !== "string" || !uuidPattern.test(line.variantId))) ||
        (line.variantName !== null && typeof line.variantName !== "string") || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999 ||
        typeof line.specialInstruction !== "string" || line.specialInstruction.length > 500 || !Array.isArray(line.modifiers) || line.modifiers.length > 20 ||
        !Array.isArray(line.modifierNames) || !line.modifierNames.every(name => typeof name === "string") || line.modifierNames.length !== line.modifiers.length ||
        !line.modifiers.every(m => m && typeof m.modifierOptionId === "string" && uuidPattern.test(m.modifierOptionId) && Number.isInteger(m.quantity) && m.quantity >= 1 && m.quantity <= 10)) return false;
    const item = p.items[index];
    return item && typeof item === "object" && item.productId === line.productId && item.variantId === line.variantId && item.quantity === line.quantity &&
      item.specialInstruction === line.specialInstruction && JSON.stringify(item.modifiers) === JSON.stringify(line.modifiers);
  });
}

/** Menu checks improve feedback; Spring remains authoritative for stock and all amounts. */
export function validateCartSelection(product: MenuProductDto, selection: ItemSelection, existingCart: CartLine[] = []): boolean {
  if (!isProductAvailable(product) || !Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 999 || (selection.specialInstruction?.length ?? 0) > 500) return false;
  const variant = product.variants.find(v => v.id === selection.variantId);
  if (product.variants.length ? !variant?.available || variant.price === null : !!selection.variantId) return false;
  const selections = selection.modifiers ?? [];
  if (selections.length > 20 || new Set(selections.map(s => s.modifierOptionId)).size !== selections.length) return false;
  const counts = new Map<string, number>();
  for (const selected of selections) {
    const group = product.modifierGroups.find(g => g.options.some(o => o.id === selected.modifierOptionId && o.available));
    if (!group || !Number.isInteger(selected.quantity) || selected.quantity < 1 || selected.quantity > 10) return false;
    counts.set(group.id, (counts.get(group.id) ?? 0) + 1);
  }
  if (product.modifierGroups.some(g => (counts.get(g.id) ?? 0) < g.minSelections || (counts.get(g.id) ?? 0) > g.maxSelections)) return false;
  const total = selection.quantity + existingCart.filter(l => l.productId === product.id).reduce((n, l) => n + l.quantity, 0);
  return !product.trackStock || total <= (product.stockQuantity ?? 0);
}

export function createGuestRequest(endpoint: string, fetchImpl: typeof fetch = fetch): GuestRequest {
  return async <T>(body: Record<string, unknown>): Promise<Envelope<T>> => {
    const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      redirect: "error", signal: AbortSignal.timeout(20_000) });
    const result = await response.json() as Envelope<T>;
    if (typeof result?.ok !== "boolean" || (!result.ok && typeof result.ambiguous !== "boolean")) throw new Error("Guest response unavailable");
    return result;
  };
}

/** All capability tokens and the immutable in-flight request live in private fields. */
export class GuestOrderController {
  #state: GuestOrderState = { ...initialOrderState };
  #listeners = new Set<(state: GuestOrderState) => void>();
  #qrToken: string | null = null;
  #queueToken: string | null = null;
  #pending: PendingCheckout | null = null;
  #mayHaveCommitted = false;
  #products = new Map<string, MenuProductDto>();
  #refreshing = false;
  #disposed = false;
  #audio: AudioContext | null = null;
  #alerted = new Set<string>();
  #generation = 0;
  constructor(private restaurantId: string, private request: GuestRequest, private newId: () => string = () => crypto.randomUUID(), private store?: RecoveryStore) {}
  get state() { return this.#state; }
  subscribe(listener: (state: GuestOrderState) => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  #update(patch: Partial<GuestOrderState>) {
    if (this.#disposed) return;
    this.#state = { ...this.#state, ...patch };
    this.#listeners.forEach(listener => listener(this.#state));
  }
  #storageKey() { return `guest-pending:${this.restaurantId}`; }
  #save() {
    try {
      if (this.#pending) this.store?.setItem(this.#storageKey(), JSON.stringify(this.#pending));
      else this.store?.removeItem(this.#storageKey());
    } catch { /* Storage is optional; a running page can still safely retry. */ }
  }
  async start(kind: QrKind | null, token: string | null) {
    this.#generation++;
    this.#qrToken = token;
    this.#update({ kind, phase: kind ? "validating" : "browse" });
    if (kind && token) {
      // Replay a saved attempt before fresh QR validation: Spring can recover a
      // committed order even after the original credential has been rotated.
      try {
        const stored = this.store?.getItem(this.#storageKey());
        const pending: unknown = stored ? JSON.parse(stored) : null;
        if (validRecovery(pending, kind)) {
          this.#pending = pending;
          this.#mayHaveCommitted = true;
          this.#update({ phase: "uncertain", context: { restaurantId: this.restaurantId, kind, tableId: pending.tableId, tableNumber: typeof pending.tableNumber === "string" ? pending.tableNumber : null }, cart: pending.cart,
            error: Date.now() - pending.createdAt > 23 * 60 * 60 * 1000 ? "expired" : "retry" });
          return;
        }
      } catch { /* Ignore malformed optional recovery state. */ }
    }
    if (kind) await this.retryValidation();
  }
  retryValidation = async () => {
    const kind = this.#state.kind;
    if (!kind || !this.#qrToken || this.#qrToken.length > 64 || !this.#qrToken.trim()) {
      this.#update({ phase: "invalid", error: "invalid-qr" }); return;
    }
    const generation = this.#generation;
    this.#update({ phase: "validating", error: null });
    try {
      const result = await this.request<QrContext>({ action: "validate", kind, qrToken: this.#qrToken });
      if (this.#disposed || generation !== this.#generation) return;
      if (!result.ok) { this.#update({ phase: result.error === "invalid-qr" ? "invalid" : "error", error: result.error }); return; }
      if (result.data.restaurantId !== this.restaurantId || result.data.kind !== kind || (kind === "TABLE_QR" && !result.data.tableId)) throw new Error("Invalid QR context");
      this.#update({ phase: "ready", context: result.data, error: null });
    } catch { if (generation === this.#generation) this.#update({ phase: "error", error: "retry" }); }
  };
  add = (product: MenuProductDto, selection: ItemSelection): boolean => {
    if (this.#state.phase !== "ready" || this.#state.cart.length >= 50 || !validateCartSelection(product, selection, this.#state.cart)) return false;
    this.#products.set(product.id, product);
    const modifiers = (selection.modifiers ?? []).map(s => ({ ...s }));
    const options = product.modifierGroups.flatMap(g => g.options);
    const line: CartLine = { id: this.newId(), productId: product.id, name: product.name,
      variantId: selection.variantId ?? null, variantName: product.variants.find(v => v.id === selection.variantId)?.name ?? null,
      quantity: selection.quantity, specialInstruction: selection.specialInstruction ?? "", modifiers,
      modifierNames: modifiers.map(s => options.find(o => o.id === s.modifierOptionId)?.name ?? "") };
    this.#update({ cart: [...this.#state.cart, line], error: null });
    return true;
  };
  remove = (id: string) => { if (this.#state.phase === "ready") this.#update({ cart: this.#state.cart.filter(l => l.id !== id), error: null }); };
  setQuantity = (id: string, quantity: number) => {
    if (this.#state.phase !== "ready") return;
    const line = this.#state.cart.find(l => l.id === id);
    const product = line && this.#products.get(line.productId);
    if (!line || !product || !validateCartSelection(product, { ...line, quantity }, this.#state.cart.filter(l => l.id !== id))) return;
    this.#update({ cart: this.#state.cart.map(l => l.id === id ? { ...l, quantity } : l), error: null });
  };
  checkout = async () => {
    if (!["ready", "uncertain"].includes(this.#state.phase) || !this.#state.kind || !this.#state.context || !this.#qrToken || !this.#state.cart.length) return;
    if (this.#pending && Date.now() - this.#pending.createdAt > 23 * 60 * 60 * 1000) {
      this.#update({ phase: "uncertain", error: "expired" }); return;
    }
    if (!this.#pending) {
      this.#pending = { key: this.newId(), createdAt: Date.now(), kind: this.#state.kind, tableId: this.#state.context.tableId, tableNumber: this.#state.context.tableNumber,
        items: this.#state.cart.map(l => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity,
          specialInstruction: l.specialInstruction, modifiers: l.modifiers.map(s => ({ ...s })) })), cart: this.#state.cart };
      this.#save();
    }
    const pending = this.#pending;
    this.#update({ phase: "submitting", error: null });
    try {
      const result = await this.request<CreateOrderResponse>({ action: "checkout", kind: pending.kind,
        qrToken: this.#qrToken, items: pending.items, idempotencyKey: pending.key });
      if (this.#disposed) return;
      if (!result.ok) {
        if (result.ambiguous || this.#mayHaveCommitted) {
          this.#mayHaveCommitted = true;
          this.#update({ phase: "uncertain", error: result.error });
        }
        else {
          this.#pending = null; this.#save();
          this.#update({ phase: result.error === "invalid-qr" ? "invalid" : "ready", error: result.error });
        }
        return;
      }
      const { queue, ...receipt } = result.data;
      if (queue) {
        const { trackingToken, ...safeQueue } = queue;
        this.#queueToken = trackingToken;
        this.#update({ receipt: { ...receipt, queue: safeQueue } });
      } else this.#update({ receipt: { ...receipt, queue: null } });
      this.#pending = null; this.#mayHaveCommitted = false; this.#save();
      this.#update({ phase: "confirmed", cart: [], error: null });
      if (queue) await this.refresh();
    } catch { this.#mayHaveCommitted = true; this.#update({ phase: "uncertain", error: "retry" }); }
  };
  refresh = async () => {
    const ticketId = this.#state.receipt?.queue?.ticketId;
    if (this.#refreshing || !ticketId || !this.#queueToken || this.#disposed) return;
    this.#refreshing = true;
    try {
      const body = { ticketId, queueToken: this.#queueToken };
      const status = await this.request<QueueTrackingResponse>({ action: "status", ...body });
      if (!status.ok || status.data.ticketId !== ticketId || status.data.orderNumber !== this.#state.receipt?.orderNumber) throw new Error("Status unavailable");
      const oldStatus = this.#state.tracking?.queueStatus;
      this.#update({ tracking: status.data, trackingError: false });
      if (["READY", "CALLED"].includes(status.data.queueStatus) && oldStatus !== status.data.queueStatus) this.#alert(status.data.queueStatus);
      const notifications = await this.request<NotificationResponse[]>({ action: "notifications", ...body });
      if (notifications.ok) this.#update({ notifications: notifications.data });
      else this.#update({ trackingError: true });
    } catch { this.#update({ trackingError: true }); }
    finally { this.#refreshing = false; }
  };
  enableSound = async () => {
    try {
      this.#audio ??= new AudioContext();
      await this.#audio.resume();
      if (this.#audio.state !== "running") throw new Error("Audio unavailable");
      this.#update({ sound: "on" });
      this.#beep();
    } catch { this.#update({ sound: "unavailable" }); }
  };
  #beep() {
    try {
      if (!this.#audio || this.#audio.state !== "running") return;
      const oscillator = this.#audio.createOscillator(), gain = this.#audio.createGain();
      oscillator.connect(gain); gain.connect(this.#audio.destination); gain.gain.value = 0.12;
      oscillator.frequency.value = 880; oscillator.start(); oscillator.stop(this.#audio.currentTime + 0.25);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { this.#update({ sound: "unavailable" }); }
  }
  #alert(status: string) { if (!this.#alerted.has(status) && this.#state.sound === "on") { this.#alerted.add(status); this.#beep(); } }
  dispose() { this.#disposed = true; this.#generation++; this.#qrToken = null; this.#queueToken = null; this.#pending = null; this.#listeners.clear(); void this.#audio?.close().catch(() => {}); }
}

export type GuestActions = Pick<GuestOrderController, "add" | "remove" | "setQuantity" | "checkout" | "retryValidation" | "refresh" | "enableSound">;
