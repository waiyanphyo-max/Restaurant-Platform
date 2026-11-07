import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { ApiHttpError, ApiProtocolError } from "@restaurant-platform/api-client";
import type { CreateOrderResponse, DeliveryCheckoutRequest, DeliveryQuoteResponse } from "@restaurant-platform/shared-types";
import * as SecureStore from "expo-secure-store";
import { getCustomerApi } from "../../api";
import { readEmbeddedTenant } from "../../tenant";
import { useCustomerCart } from "../cart/CartProvider";

export interface CheckoutAttempt {
  body: DeliveryCheckoutRequest;
  quote: DeliveryQuoteResponse;
}

type AttemptState =
  | { status: "idle" }
  | { status: "recovering" | "recovery_pending" }
  | { status: "unrecorded"; key: string }
  | { status: "submitting" | "uncertain"; attempt: CheckoutAttempt }
  | { status: "rejected"; error: unknown }
  | { status: "created"; order: CreateOrderResponse };

interface CheckoutContext {
  state: AttemptState;
  submit(attempt: CheckoutAttempt): Promise<void>;
  recover(): Promise<void>;
  abandonPrevious(): Promise<void>;
  reset(): void;
}

const Context = createContext<CheckoutContext | null>(null);

export function CustomerCheckoutProvider({ owner, children }: PropsWithChildren<{ owner: string }>) {
  const { restaurantId, environment } = readEmbeddedTenant();
  const storageKey = `rp.customer.checkout.${environment}.${restaurantId}.${owner}`;
  const [state, setState] = useState<AttemptState>({ status: "recovering" });
  const cart = useCustomerCart();
  const currentCart = useRef(cart);
  currentCart.current = cart;
  const current = useRef<AttemptState>(state);
  const request = useRef<AbortController | null>(null);

  function update(value: AttemptState) { current.current = value; setState(value); }

  async function forgetKey() { await SecureStore.deleteItemAsync(storageKey).catch(() => undefined); }

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void restore(controller, storageKey, owner, update).finally(() => {
      if (request.current === controller) request.current = null;
    });
    return () => request.current?.abort();
  }, [owner, storageKey]);

  async function recover() {
    if (request.current || current.current.status !== "recovery_pending" && current.current.status !== "unrecorded") return;
    const controller = new AbortController();
    request.current = controller;
    update({ status: "recovering" });
    try { await restore(controller, storageKey, owner, update); }
    finally { request.current = null; }
  }

  async function settlePrevious(key: string, controller: AbortController, next: AttemptState) {
    const { signal } = controller;
    try {
      const order = await getCustomerApi(owner).abandonCheckout(key, { signal });
      if (signal.aborted) return;
      if (order !== undefined) {
        update({ status: "created", order: checkedOrder(order) });
        return;
      }
      await SecureStore.deleteItemAsync(storageKey);
      if (!signal.aborted) update(next);
    } catch {
      if (!signal.aborted) update({ status: "recovery_pending" });
    }
  }

  async function abandonPrevious() {
    const previous = current.current;
    if (request.current || previous.status !== "unrecorded") return;
    const controller = new AbortController();
    request.current = controller;
    update({ status: "recovering" });
    try { await settlePrevious(previous.key, controller, { status: "idle" }); }
    finally { request.current = null; }
  }

  async function submit(attempt: CheckoutAttempt) {
    const previous = current.current;
    if (previous.status !== "idle" && !(previous.status === "uncertain" && previous.attempt === attempt)) return;
    const controller = new AbortController();
    request.current = controller;
    update({ status: "submitting", attempt });
    if (previous.status === "idle") {
      try { await SecureStore.setItemAsync(storageKey, attempt.quote.idempotencyKey); }
      catch (error) {
        if (!controller.signal.aborted) update({ status: "rejected", error });
        request.current = null;
        return;
      }
    }
    let order: CreateOrderResponse;
    try {
      if (controller.signal.aborted) return;
      order = checkedOrder(await getCustomerApi(owner).checkoutDelivery(attempt.body, attempt.quote.idempotencyKey, { signal: controller.signal }));
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiHttpError && error.code === "IDEMPOTENCY_KEY_REUSED") {
        update({ status: "recovering" });
        await restore(controller, storageKey, owner, update);
      } else if (error instanceof ApiHttpError && error.status >= 400 && error.status < 500 &&
        ![401, 403, 408, 429].includes(error.status)) {
        // Even a definitive rejection can follow an earlier transport retry whose result was lost.
        await settlePrevious(attempt.quote.idempotencyKey, controller, { status: "rejected", error });
      } else {
        update({ status: "uncertain", attempt });
      }
      return;
    } finally {
      request.current = null;
    }
    if (!controller.signal.aborted) {
      update({ status: "created", order });
      if (currentCart.current.items === attempt.body.items) currentCart.current.clear();
    }
  }

  return <Context.Provider value={{ state, submit, recover, abandonPrevious, reset() {
    if (current.current.status === "created") {
      update({ status: "recovering" });
      void forgetKey().then(() => update({ status: "idle" }));
    }
    if (current.current.status === "rejected") update({ status: "idle" });
  } }}>{children}</Context.Provider>;
}

function checkedOrder(order: CreateOrderResponse) {
  if (!order?.orderId || !order.orderNumber || order.orderType !== "DELIVERY") throw new ApiProtocolError();
  return order;
}

async function restore(controller: AbortController, storageKey: string, owner: string, update: (state: AttemptState) => void) {
  const { signal } = controller;
  let key: string | null = null;
  try {
    key = await SecureStore.getItemAsync(storageKey);
    if (signal.aborted) return;
    if (!key) { update({ status: "idle" }); return; }
    const order = checkedOrder(await getCustomerApi(owner).getCheckoutReceipt(key, { signal }));
    if (!signal.aborted) update({ status: "created", order });
  } catch (error) {
    if (!signal.aborted) update(key && error instanceof ApiHttpError && error.status === 404
      ? { status: "unrecorded", key } : { status: "recovery_pending" });
  }
}

export function useCustomerCheckout() {
  const context = useContext(Context);
  if (!context) throw new Error("CustomerCheckoutProvider is required");
  return context;
}
