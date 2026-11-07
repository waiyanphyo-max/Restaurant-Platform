import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import type { CreateOrderResponse, DeliveryQuoteResponse } from "@restaurant-platform/shared-types";
import type { CheckoutAttempt } from "./CheckoutProvider";

const mocks = vi.hoisted(() => ({
  data: [] as unknown[], refs: [] as { current: unknown }[], state: 0, ref: 0, mounted: false, cleanup: undefined as undefined | (() => void),
  get: vi.fn(), put: vi.fn(), remove: vi.fn(), submit: vi.fn(), receipt: vi.fn(), clear: vi.fn(),
  items: [{ productId: "product", quantity: 1 }]
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
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ restaurantId: "restaurant", environment: "development" }) }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ checkoutDelivery: mocks.submit, getCheckoutReceipt: mocks.receipt }) }));
vi.mock("../cart/CartProvider", () => ({ useCustomerCart: () => ({ items: mocks.items, clear: mocks.clear }) }));

import { CustomerCheckoutProvider } from "./CheckoutProvider";

const owner = "customer-a";
const storage = `rp.customer.checkout.development.restaurant.${owner}`;
const attempt: CheckoutAttempt = {
  body: { addressId: "home", recipientName: "Customer", recipientPhone: "0912345678", items: mocks.items, confirmationToken: "confirmed-quote" },
  quote: { idempotencyKey: "opaque-attempt-key" } as DeliveryQuoteResponse
};
const order: CreateOrderResponse = {
  orderId: "order", orderNumber: "ORD-1", orderType: "DELIVERY", orderChannel: "CUSTOMER_APP", status: "PENDING",
  currency: "MMK", subtotal: 8000, deliveryFee: 1000, discountAmount: 0, totalAmount: 9000, queue: null
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function render() {
  mocks.state = 0; mocks.ref = 0;
  return CustomerCheckoutProvider({ owner }).props.value;
}

describe("COD checkout and receipt recovery", () => {
  beforeEach(() => {
    mocks.cleanup?.(); mocks.data = []; mocks.refs = []; mocks.mounted = false;
    vi.resetAllMocks();
    mocks.get.mockResolvedValue(null);
    mocks.put.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.submit.mockResolvedValue(order);
  });

  it("writes only the opaque key before creating a pending COD order and suppresses duplicate taps", async () => {
    render(); await tick();
    const { submit } = render();
    await Promise.all([submit(attempt), submit(attempt)]);
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(storage, "opaque-attempt-key");
    expect(mocks.put).toHaveBeenCalledBefore(mocks.submit);
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(attempt.body, attempt.quote.idempotencyKey, { signal: expect.any(AbortSignal) });
    expect(render().state).toEqual({ status: "created", order });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  it("keeps an ambiguous checkout and retries exactly the confirmed request", async () => {
    mocks.submit.mockRejectedValueOnce(new ApiNetworkError());
    render(); await tick();
    await render().submit(attempt);
    expect(render().state).toMatchObject({ status: "uncertain", attempt });
    await render().submit({ ...attempt });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    await render().submit(attempt);
    expect(mocks.submit.mock.calls.map(([body, key]) => ({ body, key }))).toEqual([
      { body: attempt.body, key: attempt.quote.idempotencyKey }, { body: attempt.body, key: attempt.quote.idempotencyKey }
    ]);
    expect(render().state.status).toBe("created");
  });

  it("keeps the cart and releases a definitively rejected checkout for a new quote", async () => {
    const error = new ApiHttpError(409, "DELIVERY_QUOTE_CHANGED");
    mocks.submit.mockRejectedValueOnce(error);
    render(); await tick();
    await render().submit(attempt);
    expect(render().state).toEqual({ status: "rejected", error });
    expect(mocks.remove).toHaveBeenCalledWith(storage);
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

  it("keeps the recovery key on a network or authorization failure and allows a receipt recheck", async () => {
    mocks.get.mockResolvedValue("opaque-attempt-key");
    mocks.receipt.mockRejectedValueOnce(new ApiHttpError(401, "EXPIRED")).mockRejectedValueOnce(new ApiHttpError(404, "HTTP_404"));
    render(); await tick();
    expect(render().state.status).toBe("recovery_pending");
    expect(mocks.remove).not.toHaveBeenCalled();
    await render().recover();
    expect(render().state.status).toBe("unrecorded");
    await render().clearUnrecorded();
    expect(render().state.status).toBe("idle");
  });
});
