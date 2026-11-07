import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { AppState, Text } from "react-native";
import { ApiHttpError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { CustomerOrderDetailDto } from "@restaurant-platform/shared-types";
import { getCustomerApi, getCustomerPublicApi } from "../../../src/api";
import { Action, Body, Card, Page, StateView } from "../../../src/components/ui";
import { DestinationPin } from "../../../src/features/addresses/DestinationPin";
import { useCustomerCart } from "../../../src/features/cart/CartProvider";
import { rebuildCart } from "../../../src/features/cart/cart";
import { orderAmount, orderDate, statusLabel } from "../../../src/features/orders/presentation";
import { useApiQuery } from "../../../src/hooks/useApiQuery";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../../src/i18n";

export default function OrderDetail() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const t = useCustomerText();
  const router = useRouter();
  const { state, reload } = useApiQuery(signal => getCustomerApi().getOrder(orderId, { signal }), `order:${orderId}`, true);
  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener("change", next => { if (next === "active") reload(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") reload(); }, 20_000);
    return () => { clearInterval(timer); subscription.remove(); };
  }, [reload]));
  return <Page title={t("Order tracking", "မှာယူမှု ခြေရာခံရန်")}>
    <Action title={t("Order history", "မှာယူမှုမှတ်တမ်း")} secondary onPress={() => router.navigate("/orders")} />
    {state.status === "ready" ? <OrderDetails key={state.data.id} order={state.data} reload={reload} />
      : <StateView kind={state.status} title={queryStateLabel(state.status, t)}
        retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} onRetry={reload} />}
  </Page>;
}

function OrderDetails({ order, reload }: { order: CustomerOrderDetailDto; reload(): void }) {
  const router = useRouter();
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const cart = useCustomerCart();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  const amount = (value: number) => orderAmount(value, order.currency, language);

  async function perform(action: "cancel" | "reorder") {
    if (mutation.current) return;
    const controller = new AbortController();
    mutation.current = controller;
    setMessage(null);
    setBusy(true);
    try {
      if (action === "cancel") {
        await getCustomerApi().cancelOrder(order.id, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setMessage(t("Order cancelled.", "မှာယူမှုကို ပယ်ဖျက်ပြီးပါပြီ။"));
      } else {
        const menu = await getCustomerPublicApi().getPublicMenu({ signal: controller.signal });
        if (controller.signal.aborted) return;
        const { lines, unavailable } = rebuildCart(menu, order.items);
        if (!lines.length) {
          setMessage(t("The items in this order are no longer available.", "ဤမှာယူမှုမှ ပစ္စည်းများ မရနိုင်တော့ပါ။"));
          return;
        }
        cart.replace(lines, unavailable);
        router.navigate("/cart");
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(
        error instanceof MissingAccessTokenError || error instanceof ApiHttpError && [401, 403].includes(error.status)
          ? t("Your session has expired. Sign in again.", "သင့်အကောင့် ဝင်ရောက်ချိန် ကုန်ဆုံးသွားပါပြီ။ ပြန်ဝင်ပါ။")
          : action === "cancel"
            ? t("Cancellation could not be confirmed. Check the refreshed order before trying again.", "ပယ်ဖျက်မှုကို အတည်မပြုနိုင်ပါ။ ထပ်မကြိုးစားမီ မှာယူမှုကို ပြန်စစ်ပါ။")
            : t("The current menu could not be loaded. Reconnect and try again.", "လက်ရှိမီနူးကို မဖွင့်နိုင်ပါ။ အင်တာနက်ပြန်ချိတ်ပြီး ထပ်ကြိုးစားပါ။"));
    } finally {
      mutation.current = null;
      if (!controller.signal.aborted) {
        if (action === "cancel") reload();
        setBusy(false);
        setConfirming(false);
      }
    }
  }

  return <>
    <Card title={order.orderNumber}>
      <Body>{orderDate(order.createdAt, language)}</Body>
      <Body>{statusLabel(order.status, language)}</Body>
      {order.delivery ? <Body>{t("Delivery", "ပို့ဆောင်မှု")} · {statusLabel(order.delivery.status, language)}</Body> : null}
      <Action title={t("Refresh tracking", "အခြေအနေ ပြန်စစ်ရန်")} onPress={reload} secondary disabled={busy} />
    </Card>
    <Card title={t("Items and total", "ပစ္စည်းများနှင့် စုစုပေါင်းငွေ")}>
      {order.items.map(item => <Body key={item.id}>
        {[item.productName, item.variantName, ...item.modifiers.map(modifier => modifier.name)].filter(Boolean).join(" · ")} × {item.quantity} · {amount(item.subtotal)}
      </Body>)}
      <Body>{t("Subtotal", "ပစ္စည်း စုစုပေါင်း")} · {amount(order.subtotal)}</Body>
      <Body>{t("Delivery fee", "ပို့ဆောင်ခ")} · {amount(order.deliveryFee)}</Body>
      {order.discountAmount ? <Body>{t("Discount", "လျှော့ဈေး")} · {amount(order.discountAmount)}</Body> : null}
      <Body>{t("Total", "စုစုပေါင်း")} · {amount(order.totalAmount)}</Body>
      {order.payments.map(payment => <Body key={payment.id}>
        {payment.method === "CASH_ON_DELIVERY" ? t("Cash on delivery", "ပစ္စည်းရောက်မှ ငွေချေမည်") : payment.method}
        {" · "}{payment.method === "CASH_ON_DELIVERY" && payment.status === "PENDING" ? t("Cash due", "ငွေချေရန် ကျန်သေးသည်") : statusLabel(payment.status, language)}
      </Body>)}
    </Card>
    {order.deliveryAddress ? <Card title={t("Confirmed delivery location", "အတည်ပြုထားသော ပို့ဆောင်မည့်နေရာ")}>
      {order.deliveryLocationSource === "GPS_CONFIRMED" || order.deliveryLocationSource === "MANUAL_MAP"
        ? <Body>{t("Temporary delivery location", "ယခုမှာယူမှုအတွက် ပို့ဆောင်မည့်နေရာ")}</Body> : null}
      <Body>{order.deliveryAddress}</Body>
      {order.deliveryName || order.deliveryPhone ? <Body>{[order.deliveryName, order.deliveryPhone].filter(Boolean).join(" · ")}</Body> : null}
      {order.deliveryNote ? <Body>{order.deliveryNote}</Body> : null}
      <DestinationPin latitude={order.deliveryLatitude} longitude={order.deliveryLongitude} language={language} />
    </Card> : null}
    <Card title={t("Status timeline", "အခြေအနေ အဆင့်ဆင့်")}>
      {order.statusHistory.map((entry, index) => <Body key={`order:${index}`}>{statusLabel(entry.status, language)} · {orderDate(entry.changedAt, language)}</Body>)}
      {order.delivery?.statusHistory?.map((entry, index) => <Body key={`delivery:${index}`}>{statusLabel(entry.status, language)} · {orderDate(entry.changedAt, language)}</Body>)}
    </Card>
    <Card>
      <Action title={t("Notifications for this order", "ဤမှာယူမှုအတွက် အသိပေးချက်များ")} secondary
        onPress={() => router.push({ pathname: "/notifications", params: { orderId: order.id } })} />
      {order.canCancel && !confirming ? <Action title={t("Cancel order", "မှာယူမှု ပယ်ဖျက်ရန်")} secondary onPress={() => setConfirming(true)} /> : null}
      {order.canCancel && confirming ? <>
        <Action title={t("Confirm cancellation", "ပယ်ဖျက်မှု အတည်ပြုရန်")} onPress={() => void perform("cancel")} disabled={busy} />
        <Action title={t("Keep order", "မှာယူမှု ဆက်ထားရန်")} secondary onPress={() => setConfirming(false)} disabled={busy} />
      </> : null}
      {order.orderType === "DELIVERY" && ["COMPLETED", "CANCELLED"].includes(order.status) ? <>
        {cart.items.length ? <Body>{t("Reordering replaces the current cart with available items at today's prices.",
          "ထပ်မှာယူလျှင် လက်ရှိခြင်းတောင်းကို ယနေ့ဈေးနှုန်းဖြင့် ရရှိနိုင်သော ပစ္စည်းများနှင့် အစားထိုးပါမည်။")}</Body> : null}
        <Action title={t("Reorder into cart", "ခြင်းတောင်းသို့ ထပ်ထည့်ရန်")} onPress={() => void perform("reorder")} disabled={busy} />
      </> : null}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    </Card>
  </>;
}
