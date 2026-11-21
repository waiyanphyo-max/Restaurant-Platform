import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { CreateOrderResponse, DeliveryQuoteResponse } from "@restaurant-platform/shared-types";
import type { CheckoutAttempt } from "./CheckoutProvider";

const mocks = vi.hoisted(() => ({
  data: [] as unknown[], refs: [] as { current: unknown }[], state: 0, ref: 0, mounted: false, cleanup: undefined as undefined | (() => void),
  get: vi.fn(), put: vi.fn(), remove: vi.fn(), submit: vi.fn(), receipt: vi.fn(), abandon: vi.fn(), clear: vi.fn(),
  items: [{ productId: "product", quantity: 1 }]
  , restaurantId: "restaurant", environment: "development"
}));
vi.mock("react", async load => ({
  ...await load<typeof import("react")>(),
  useState(initial: unknown) {
    const index = mocks.state++;
    if (!(index in mocks.data)) mocks.data[index] = initial;
    return [mocks.data[index], (value: unknown) => { mocks.data[index] = value; }];
  },
  useRef(initial: unknown) {
    const index = mocks.ref++;
    return mocks.refs[index] ??= { current: initial };
  },
  useEffect(effect: () => () => void) {
    if (!mocks.mounted) { mocks.mounted = true; mocks.cleanup = effect(); }
  }
}));
vi.mock("expo-secure-store", () => ({ getItemAsync: mocks.get, setItemAsync: mocks.put, deleteItemAsync: mocks.remove }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ restaurantId: mocks.restaurantId, environment: mocks.environment }) }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ checkoutDelivery: mocks.submit, getCheckoutReceipt: mocks.receipt,
  abandonCheckout: mocks.abandon }) }));
vi.mock("../cart/CartProvider", () => ({ useCustomerCart: () => ({ items: mocks.items, clear: mocks.clear }) }));

import { CustomerCheckoutProvider } from "./CheckoutProvider";

const owner = "customer-a";
const storage = `rp.customer.checkout.development.restaurant.${owner}`;
const attempt: CheckoutAttempt = {
  body: { addressId: "home", recipientName: "Customer", recipientPhone: "0912345678", items: mocks.items, confirmationToken: "confirmed-quote" },
  quote: { idempotencyKey: "opaque-attempt-key" } as DeliveryQuoteResponse
};
const textAttempt: CheckoutAttempt = {
  ...attempt,
  body: { recipientName: "Customer", recipientPhone: "+959942123456", items: mocks.items, confirmationToken: "text-quote",
    temporaryDestination: { source: "MANUAL_TEXT", address: "Room 4, Main Road, Ward 1", city: "Yangon", township: "Tamwe" } }
};
const order: CreateOrderResponse = {
  orderId: "order", orderNumber: "ORD-1", orderType: "DELIVERY", orderChannel: "CUSTOMER_APP", status: "PENDING",
  currency: "MMK", subtotal: 8000, deliveryFee: 1000, discountAmount: 0, totalAmount: 9000, queue: null
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function render(accountOwner = owner) {
  mocks.state = 0; mocks.ref = 0;
  return CustomerCheckoutProvider({ owner: accountOwner }).props.value;
}

describe("COD checkout and receipt recovery", () => {
  beforeEach(() => {
    mocks.cleanup?.(); mocks.data = []; mocks.refs = []; mocks.mounted = false;
    vi.resetAllMocks();
    mocks.restaurantId = "restaurant"; mocks.environment = "development"; mocks.items = attempt.body.items;
    mocks.get.mockResolvedValue(null);
    mocks.put.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.submit.mockResolvedValue(order);
    mocks.abandon.mockResolvedValue(undefined);
  });

  it.each([attempt, textAttempt])("writes only the opaque key before creating a pending COD order and suppresses duplicate taps for %j", async confirmed => {
    render(); await tick();
    const { submit } = render();
    await Promise.all([submit(confirmed), submit(confirmed)]);
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(storage, "opaque-attempt-key");
    expect(mocks.put).toHaveBeenCalledBefore(mocks.submit);
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(confirmed.body, confirmed.quote.idempotencyKey, { signal: expect.any(AbortSignal) });
    expect(render().state).toEqual({ status: "created", order });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  it.each([attempt, textAttempt])("keeps an ambiguous checkout and retries exactly the confirmed request for %j", async confirmed => {
    mocks.submit.mockRejectedValueOnce(new ApiNetworkError());
    render(); await tick();
    await render().submit(confirmed);
    expect(render().state).toMatchObject({ status: "uncertain", attempt: confirmed });
    await render().submit({ ...confirmed });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    await render().submit(confirmed);
    expect(mocks.submit.mock.calls.map(([body, key]) => ({ body, key }))).toEqual([
      { body: confirmed.body, key: confirmed.quote.idempotencyKey }, { body: confirmed.body, key: confirmed.quote.idempotencyKey }
    ]);
    expect(render().state.status).toBe("created");
  });

  it.each([undefined, order])("settles a timed-out checkout without restarting with server receipt %j", async receipt => {
    mocks.submit.mockRejectedValueOnce(new ApiTimeoutError());
    mocks.abandon.mockResolvedValue(receipt);
    render(); await tick();
    await render().submit(attempt);
    expect(render().state).toEqual({ status: "uncertain", attempt });
    const { abandonPrevious } = render();
    await Promise.all([abandonPrevious(), abandonPrevious()]);
    expect(mocks.abandon).toHaveBeenCalledExactlyOnceWith(attempt.quote.idempotencyKey, { signal: expect.any(AbortSignal) });
    expect(mocks.submit).toHaveBeenCalledOnce();
    if (receipt) {
      expect(render().state).toEqual({ status: "created", order: receipt });
      expect(mocks.remove).not.toHaveBeenCalled();
    } else {
      expect(render().state.status).toBe("idle");
      expect(mocks.abandon).toHaveBeenCalledBefore(mocks.remove);
    }
  });

  it("keeps the cart and releases a definitively rejected checkout for a new quote", async () => {
    const error = new ApiHttpError(409, "DELIVERY_QUOTE_CHANGED");
    mocks.submit.mockRejectedValueOnce(error);
    render(); await tick();
    await render().submit(attempt);
    expect(render().state).toEqual({ status: "rejected", error });
    expect(mocks.remove).toHaveBeenCalledWith(storage);
    expect(mocks.abandon).toHaveBeenCalledBefore(mocks.remove);
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("restores an authoritative receipt after restarting without resending any private destination", async () => {
    mocks.get.mockResolvedValue("opaque-attempt-key");
    mocks.receipt.mockResolvedValue(order);
    expect(render().state.status).toBe("recovering");
    await tick();
    expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith("opaque-attempt-key", { signal: expect.any(AbortSignal) });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(render().state).toEqual({ status: "created", order });
  });

  it("keeps the recovery key until the server confirms abandonment", async () => {
    mocks.get.mockResolvedValue("opaque-attempt-key");
    mocks.receipt.mockRejectedValueOnce(new ApiHttpError(401, "EXPIRED")).mockRejectedValueOnce(new ApiHttpError(404, "HTTP_404"));
    render(); await tick();
    expect(render().state.status).toBe("recovery_pending");
    expect(mocks.remove).not.toHaveBeenCalled();
    await render().recover();
    expect(render().state.status).toBe("unrecorded");
    const { abandonPrevious } = render();
    await Promise.all([abandonPrevious(), abandonPrevious()]);
    expect(mocks.abandon).toHaveBeenCalledExactlyOnceWith("opaque-attempt-key", { signal: expect.any(AbortSignal) });
    expect(mocks.abandon).toHaveBeenCalledBefore(mocks.remove);
    expect(render().state.status).toBe("idle");
  });

  it("recovers a delayed committed checkout even after an earlier receipt lookup returned 404", async () => {
    mocks.get.mockResolvedValue("opaque-attempt-key");
    mocks.receipt.mockRejectedValueOnce(new ApiHttpError(404, "HTTP_404"));
    mocks.abandon.mockResolvedValue(order);
    render(); await tick();
    expect(render().state.status).toBe("unrecorded");
    await render().abandonPrevious();
    expect(render().state).toEqual({ status: "created", order });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("keeps the key after abandonment times out and allows the server operation to be retried", async () => {
    mocks.get.mockResolvedValue("opaque-attempt-key");
    mocks.receipt.mockRejectedValue(new ApiHttpError(404, "HTTP_404"));
    mocks.abandon.mockRejectedValueOnce(new ApiTimeoutError());
    render(); await tick();
    await render().abandonPrevious();
    expect(render().state.status).toBe("recovery_pending");
    expect(mocks.remove).not.toHaveBeenCalled();
    await render().recover();
    await render().abandonPrevious();
    expect(render().state.status).toBe("idle");
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("recovers the winning receipt when a concurrently confirmed body conflicts on the same key", async () => {
    mocks.submit.mockRejectedValueOnce(new ApiHttpError(409, "IDEMPOTENCY_KEY_REUSED"));
    render(); await tick();
    mocks.get.mockResolvedValue("opaque-attempt-key");
    mocks.receipt.mockResolvedValue(order);
    await render().submit(attempt);
    expect(render().state).toEqual({ status: "created", order });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("preserves the original unresolved attempt across cart edits, route-local resets and a late response", async () => {
    mocks.submit.mockRejectedValueOnce(new ApiNetworkError());
    render(); await tick();
    await render().submit(textAttempt);
    mocks.items = [{ productId: "another-current-product", quantity: 3 }];
    render().reset(); // Address/Cart/Orders navigation may reset only local quote review.
    expect(render().state).toEqual({ status: "uncertain", attempt: textAttempt });
    expect(mocks.remove).not.toHaveBeenCalled();
    await render().submit(textAttempt);
    expect(mocks.submit.mock.calls[1][0]).toBe(textAttempt.body);
    expect(mocks.submit.mock.calls[1][1]).toBe(textAttempt.quote.idempotencyKey);
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("keeps a submitted key after sign-out abort and recovers its receipt on the next mount", async () => {
    let resolve!: (value: CreateOrderResponse) => void;
    mocks.submit.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(); await tick();
    const pending = render().submit(attempt); await tick();
    const signal = mocks.submit.mock.calls[0][2].signal as AbortSignal;
    mocks.cleanup?.();
    expect(signal.aborted).toBe(true);
    resolve(order); await pending;
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    mocks.data = []; mocks.refs = []; mocks.mounted = false;
    mocks.get.mockResolvedValue(attempt.quote.idempotencyKey); mocks.receipt.mockResolvedValue(order);
    render(); await tick();
    expect(render().state).toEqual({ status: "created", order });
    expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith(attempt.quote.idempotencyKey, { signal: expect.any(AbortSignal) });
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it.each([
    ["00000000-0000-4000-8000-000000000101", "customer-a", "staging"],
    ["00000000-0000-4000-8000-000000000102", "customer-b", "development"]
  ])("scopes durable recovery to restaurant %s, account %s and environment %s", async (restaurantId, accountOwner, environment) => {
    mocks.restaurantId = restaurantId; mocks.environment = environment;
    render(accountOwner); await tick();
    await render(accountOwner).submit(attempt);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(`rp.customer.checkout.${environment}.${restaurantId}.${accountOwner}`);
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(`rp.customer.checkout.${environment}.${restaurantId}.${accountOwner}`, attempt.quote.idempotencyKey);
  });
});
