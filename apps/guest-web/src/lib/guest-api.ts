import {
  ApiConfigurationError, ApiHttpError, ApiProtocolError, createPublicRestaurantApiClient,
} from "@restaurant-platform/api-client";
import type {
  CreateOrderItemRequest, CreateOrderResponse, NotificationResponse, QueueTrackingResponse,
} from "@restaurant-platform/shared-types";
import { resolveGuestTenantContext } from "./tenant-server";

type QrKind = "COMMON_QR" | "TABLE_QR";
type GuestError = "invalid-qr" | "unavailable" | "selection" | "conflict" | "retry" | "configuration";
type Input =
  | { action: "validate"; kind: QrKind; qrToken: string }
  | { action: "checkout"; kind: QrKind; qrToken: string; items: CreateOrderItemRequest[]; idempotencyKey: string }
  | { action: "status" | "notifications"; ticketId: string; queueToken: string }
  | { action: "read"; ticketId: string; queueToken: string; notificationId: string };
interface Options { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const queueStates = ["WAITING", "READY", "CALLED", "COMPLETED", "CANCELLED"];
const orderStates = ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"];
const responseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiProtocolError();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new ApiProtocolError();
  return value;
}
function uuid(value: unknown): string {
  const id = text(value, 36);
  if (!uuidPattern.test(id)) throw new ApiProtocolError();
  return id.toLowerCase();
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new ApiProtocolError();
  return value;
}
function enumeration(value: unknown, values: readonly string[]): string {
  if (typeof value !== "string" || !values.includes(value)) throw new ApiProtocolError();
  return value;
}
function date(value: unknown): string {
  const result = text(value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new ApiProtocolError();
  return result;
}
function nullableDate(value: unknown): string | null { return value === null ? null : date(value); }
function only(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some(key => !fields.includes(key))) throw new ApiProtocolError();
}
function kind(value: unknown): QrKind { return enumeration(value, ["COMMON_QR", "TABLE_QR"]) as QrKind; }
function item(value: unknown): CreateOrderItemRequest {
  const line = record(value);
  only(line, ["productId", "variantId", "quantity", "specialInstruction", "modifiers"]);
  const note = line.specialInstruction;
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 500)) throw new ApiProtocolError();
  const modifiers = line.modifiers === undefined || line.modifiers === null ? [] : line.modifiers;
  if (!Array.isArray(modifiers) || modifiers.length > 20) throw new ApiProtocolError();
  return {
    productId: uuid(line.productId), variantId: line.variantId == null ? null : uuid(line.variantId),
    quantity: integer(line.quantity, 1, 999), specialInstruction: note as string | null | undefined,
    modifiers: modifiers.map(value => {
      const option = record(value);
      only(option, ["modifierOptionId", "quantity"]);
      return { modifierOptionId: uuid(option.modifierOptionId), quantity: integer(option.quantity, 1, 10) };
    }),
  };
}
function parseInput(value: unknown): Input {
  const input = record(value);
  if (input.action === "validate") {
    only(input, ["action", "kind", "qrToken"]);
    return { action: "validate", kind: kind(input.kind), qrToken: text(input.qrToken, 64) };
  }
  if (input.action === "checkout") {
    only(input, ["action", "kind", "qrToken", "items", "idempotencyKey"]);
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw new ApiProtocolError();
    const key = text(input.idempotencyKey, 128);
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new ApiProtocolError();
    return { action: "checkout", kind: kind(input.kind), qrToken: text(input.qrToken, 64), items: input.items.map(item), idempotencyKey: key };
  }
  if (input.action === "status" || input.action === "notifications" || input.action === "read") {
    only(input, input.action === "read" ? ["action", "ticketId", "queueToken", "notificationId"] : ["action", "ticketId", "queueToken"]);
    const queueToken = text(input.queueToken, 4096);
    // The token travels in an HTTP header. Reject control characters and non-ASCII before fetching.
    if (!/^[\x21-\x7e]+$/.test(queueToken)) throw new ApiProtocolError();
    const common = { ticketId: uuid(input.ticketId), queueToken };
    return input.action === "read" ? { ...common, action: "read", notificationId: uuid(input.notificationId) } : { ...common, action: input.action };
  }
  throw new ApiProtocolError();
}

function parseContext(value: unknown, restaurantId: string, expectedKind: QrKind) {
  const context = record(value);
  if (uuid(context.restaurantId) !== restaurantId.toLowerCase() || kind(context.kind) !== expectedKind) throw new ApiProtocolError();
  const tableId = context.tableId === null ? null : uuid(context.tableId);
  const tableNumber = context.tableNumber === null ? null : text(context.tableNumber, 100);
  if ((expectedKind === "TABLE_QR" && (!tableId || !tableNumber)) || (expectedKind === "COMMON_QR" && (tableId !== null || tableNumber !== null))) throw new ApiProtocolError();
  return { restaurantId: restaurantId.toLowerCase(), kind: expectedKind, tableId, tableNumber };
}
function parseOrder(value: unknown, expectedKind: QrKind): CreateOrderResponse {
  const order = record(value);
  const expectedType = expectedKind === "TABLE_QR" ? "DINE_IN" : "TAKEAWAY";
  if (order.orderType !== expectedType || order.orderChannel !== expectedKind) throw new ApiProtocolError();
  const currency = text(order.currency, 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new ApiProtocolError();
  const subtotal = integer(order.subtotal), deliveryFee = integer(order.deliveryFee), discountAmount = integer(order.discountAmount), totalAmount = integer(order.totalAmount);
  if (!Number.isSafeInteger(subtotal + deliveryFee - discountAmount) || subtotal + deliveryFee - discountAmount !== totalAmount) throw new ApiProtocolError();
  let queue: CreateOrderResponse["queue"] = null;
  if (order.queue !== null) {
    const q = record(order.queue);
    queue = { ticketId: uuid(q.ticketId), queueNumber: integer(q.queueNumber, 1), displayCode: text(q.displayCode, 64), status: enumeration(q.status, queueStates), trackingToken: text(q.trackingToken, 4096) };
    if (!/^[\x21-\x7e]+$/.test(queue.trackingToken)) throw new ApiProtocolError();
  }
  if ((expectedKind === "TABLE_QR" && queue !== null) || (expectedKind === "COMMON_QR" && queue === null)) throw new ApiProtocolError();
  return { orderId: uuid(order.orderId), orderNumber: text(order.orderNumber, 96), orderType: expectedType, orderChannel: expectedKind,
    status: enumeration(order.status, orderStates), currency, subtotal, deliveryFee, discountAmount, totalAmount, queue };
}
function parseStatus(value: unknown, ticketId: string): QueueTrackingResponse {
  const status = record(value);
  if (uuid(status.ticketId) !== ticketId) throw new ApiProtocolError();
  return { ticketId, queueNumber: integer(status.queueNumber, 1), displayCode: text(status.displayCode, 64), queueStatus: enumeration(status.queueStatus, queueStates),
    orderNumber: text(status.orderNumber, 96), orderStatus: enumeration(status.orderStatus, orderStates), createdAt: date(status.createdAt),
    readyAt: nullableDate(status.readyAt), calledAt: nullableDate(status.calledAt), completedAt: nullableDate(status.completedAt) };
}
function parseNotification(value: unknown, ticketId: string): NotificationResponse {
  const notice = record(value);
  if (uuid(notice.queueTicketId) !== ticketId) throw new ApiProtocolError();
  return { id: uuid(notice.id), orderId: notice.orderId === null ? null : uuid(notice.orderId), queueTicketId: ticketId, notificationType: text(notice.notificationType, 80),
    title: text(notice.title, 500), body: text(notice.body, 2000), channel: text(notice.channel, 80), status: text(notice.status, 80),
    createdAt: date(notice.createdAt), readAt: nullableDate(notice.readAt) };
}

function result(data: unknown) { return Response.json({ ok: true, data }, { headers: responseHeaders }); }
function failure(error: GuestError, status: number, ambiguous = false, retryable = false) {
  return Response.json({ ok: false, error, retryable, ambiguous }, { status, headers: responseHeaders });
}
function failureFrom(error: unknown, action: Input["action"]) {
  const checkout = action === "checkout";
  if (error instanceof ApiConfigurationError) return failure("configuration", 503, false, true);
  if (error instanceof ApiHttpError) {
    if (error.code === "IDEMPOTENCY_ENCRYPTION_NOT_CONFIGURED") return failure("configuration", 503, false, true);
    if (["INVALID_COMMON_QR_TOKEN", "INVALID_TABLE_QR_TOKEN", "QUEUE_TICKET_NOT_FOUND", "NOTIFICATION_NOT_FOUND"].includes(error.code) || [401, 403, 410].includes(error.status)) return failure("invalid-qr", 403);
    if (["RESTAURANT_NOT_FOUND", "RESTAURANT_SETTINGS_MISSING", "QR_ORDERING_DISABLED", "TAKEAWAY_UNAVAILABLE"].includes(error.code)) return failure("unavailable", 409);
    if (["IDEMPOTENCY_REQUEST_IN_PROGRESS", "IDEMPOTENCY_KEY_REUSED"].includes(error.code)) return failure("conflict", 409, checkout, true);
    if (error.status === 400 || ["INVALID_PRODUCT", "PRODUCT_UNAVAILABLE", "PRODUCT_CATEGORY_INACTIVE", "INSUFFICIENT_STOCK", "MODIFIER_GROUP_INACTIVE"].includes(error.code)) return failure("selection", 422);
    if (error.status === 404) return failure(action === "validate" ? "unavailable" : "invalid-qr", 404);
    if (error.status === 409) return failure("conflict", 409, checkout, true);
  }
  // A malformed successful checkout or lost response may already have committed. Keep its key and body.
  return failure("retry", 503, checkout, true);
}

function apiOrigin(value: string) {
  let origin: URL;
  try { origin = new URL(value); } catch { throw new ApiConfigurationError("Invalid API origin"); }
  const local = origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(origin.hostname);
  if ((origin.protocol !== "https:" && !local) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || value.trim() !== value) throw new ApiConfigurationError("Invalid API origin");
  return origin;
}
async function validateQr(origin: URL, restaurantId: string, input: Extract<Input, { action: "validate" }>, fetchImpl: typeof fetch, timeoutMs: number) {
  const response = await fetchImpl(new URL(`/api/v1/public/restaurants/${restaurantId}/qr-context`, origin), {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ kind: input.kind, qrToken: input.qrToken }), signal: AbortSignal.timeout(timeoutMs),
    credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
  });
  if (response.redirected || (response.url && new URL(response.url).origin !== origin.origin)) throw new ApiProtocolError();
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const error = record(await response.json());
      if (typeof error.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)) code = error.code;
    } catch { /* Never pass upstream bodies or credential-bearing errors to the browser. */ }
    throw new ApiHttpError(response.status, code);
  }
  return parseContext(await response.json(), restaurantId, input.kind);
}

/** Same-origin public BFF. The resolved host/path is the only restaurant authority. */
export async function handleGuestApi(request: Request, slug?: string, options: Options = {}): Promise<Response> {
  let input: Input;
  try {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const expectedHost = request.headers.get("host") ?? url.host;
    if (request.method !== "POST" || url.search || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure("selection", 400);
    if (origin && (new URL(origin).host !== expectedHost || new URL(origin).protocol !== url.protocol || new URL(origin).origin !== origin)) return failure("invalid-qr", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 100_000) return failure("selection", 413);
    const body = await request.text();
    if (body.length > 100_000) return failure("selection", 413);
    input = parseInput(JSON.parse(body));
  } catch { return failure("selection", 400); }
  const tenant = await resolveGuestTenantContext(slug);
  if (!tenant) return failure("unavailable", 404);
  const baseUrl = options.baseUrl ?? process.env.GUEST_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) return failure("configuration", 503, false, true);
  try {
    const origin = apiOrigin(baseUrl);
    const restaurantId = tenant.restaurant.restaurantId.toLowerCase();
    const fetchImpl = options.fetchImpl ?? fetch;
    const timeoutMs = options.timeoutMs ?? 8000;
    if (input.action === "validate") return result(await validateQr(origin, restaurantId, input, fetchImpl, timeoutMs));
    const scopedFetch: typeof fetch = (target, init) => {
      const headers = new Headers(init?.headers);
      if (new URL(String(target)).pathname.startsWith("/api/v1/public/queue-tickets/")) headers.set("X-Restaurant-Id", restaurantId);
      return fetchImpl(target, { ...init, headers });
    };
    const client = createPublicRestaurantApiClient({ restaurantId, baseUrl, fetchImpl: scopedFetch, timeoutMs });
    if (input.action === "checkout") {
      const body = { qrToken: input.qrToken, items: input.items };
      const order = input.kind === "TABLE_QR" ? await client.createTableQrOrder(body, input.idempotencyKey) : await client.createCommonQrOrder(body, input.idempotencyKey);
      return result(parseOrder(order, input.kind));
    }
    if (input.action === "status") return result(parseStatus(await client.getQueueStatus(input.ticketId, input.queueToken), input.ticketId));
    if (input.action === "read") {
      const notice = parseNotification(await client.markQueueNotificationRead(input.ticketId, input.notificationId, input.queueToken), input.ticketId);
      if (notice.id !== input.notificationId) throw new ApiProtocolError();
      return result(notice);
    }
    const notices = await client.getQueueNotifications(input.ticketId, input.queueToken);
    if (!Array.isArray(notices) || notices.length > 1000) throw new ApiProtocolError();
    return result(notices.map(notice => parseNotification(notice, input.ticketId)));
  } catch (error) { return failureFrom(error, input.action); }
}
