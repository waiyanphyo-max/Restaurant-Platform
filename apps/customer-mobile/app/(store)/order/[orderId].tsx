import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { AppState } from "react-native";
import type { CustomerOrderDetailDto } from "@restaurant-platform/shared-types";
import { getCustomerApi, getCustomerPublicApi } from "../../../src/api";
import { Action, Badge, Body, Card, ConfirmDialog, Page, StateView, Status } from "../../../src/components/ui";
import { DestinationPin } from "../../../src/features/addresses/DestinationPin";
import { useCustomerCart } from "../../../src/features/cart/CartProvider";
import { rebuildCart } from "../../../src/features/cart/cart";
import { orderAmount, orderDate, orderStatusTone, paymentStatusLabel, statusLabel } from "../../../src/features/orders/presentation";
import { apiFailure, apiFailureMessage } from "../../../src/hooks/apiFailure";
import { useApiQuery } from "../../../src/hooks/useApiQuery";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../../src/i18n";

export default function OrderDetail() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const t = useCustomerText();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { state, reload } = useApiQuery(async signal => {
    try { return await getCustomerApi().getOrder(orderId, { signal }); }
    finally { if (!signal.aborted) setRefreshing(false); }
  }, `order:${orderId}`, true);
  const refresh = () => { setRefreshing(true); reload(); };
  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener("change", next => { if (next === "active") reload(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") reload(); }, 20_000);
    return () => { clearInterval(timer); subscription.remove(); };
  }, [reload]));
  const unavailable = state.status !== "ready" && "failure" in state && [403, 404].includes(state.failure?.status ?? 0);
  return <Page title={unavailable ? t("Unable to open this order", "ဤမှာယူမှုကို မဖွင့်နိုင်ပါ") : t("Order tracking", "မှာယူမှု ခြေရာခံရန်")}
    subtitle={unavailable ? t("The link may be invalid or belong to another restaurant.", "လင့်ခ် မမှန်ခြင်း သို့မဟုတ် အခြားစားသောက်ဆိုင်နှင့် သက်ဆိုင်ခြင်း ဖြစ်နိုင်ပါသည်။") : undefined}
    onRefresh={refresh} refreshing={refreshing}>
    {state.status === "ready" ? <OrderDetails key={state.data.id} order={state.data} reload={refresh} refreshing={refreshing} />
      : unavailable ? <Status>{t("Open your order history or return to the current restaurant.", "သင့်မှာယူမှုမှတ်တမ်းကို ဖွင့်ပါ သို့မဟုတ် လက်ရှိစားသောက်ဆိုင်သို့ ပြန်သွားပါ။")}</Status>
        : <StateView kind={state.status} title={queryStateLabel(state.status, t)}
          message={"failure" in state ? apiFailureMessage(state.failure, t) : undefined}
          retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} onRetry={refresh} />}
    <Action title={t("Order history", "မှာယူမှုမှတ်တမ်း")} secondary onPress={() => router.navigate("/orders")} />
    {unavailable ? <Action title={t("Back to Home", "ပင်မစာမျက်နှာသို့ ပြန်ရန်")} onPress={() => router.navigate("/home")} /> : null}
  </Page>;
}

function OrderDetails({ order, reload, refreshing }: { order: CustomerOrderDetailDto; reload(): void; refreshing: boolean }) {
  const router = useRouter();
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const cart = useCustomerCart();
  const [confirming, setConfirming] = useState(false);
  const [reorder, setReorder] = useState<ReturnType<typeof rebuildCart> | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancellation, setCancellation] = useState<"idle" | "uncertain" | "settled">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const cancellationRef = useRef(cancellation);
  const cancellationReview = useRef(false);
  const reorderReview = useRef<ReturnType<typeof rebuildCart> | null>(null);
  const latest = useRef({ order, cart });
  latest.current = { order, cart };
  useEffect(() => () => mutation.current?.abort(), []);
  const amount = (value: number) => orderAmount(value, order.currency, language);
  function updateCancellation(value: typeof cancellation) { cancellationRef.current = value; setCancellation(value); }

  async function perform(action: "cancel" | "reorder" | "reconcile") {
    if (mutation.current || action === "cancel" && (!latest.current.order.canCancel || cancellationRef.current !== "idle" || !cancellationReview.current)) return;
    if (action === "cancel") cancellationReview.current = false;
    const controller = new AbortController();
    mutation.current = controller;
    setMessage(null);
    setBusy(true);
    try {
      if (action === "cancel") {
        await getCustomerApi().cancelOrder(order.id, { signal: controller.signal });
        if (controller.signal.aborted) return;
        updateCancellation("settled");
        setMessage(t("Order cancelled.", "မှာယူမှုကို ပယ်ဖျက်ပြီးပါပြီ။"));
        reload();
      } else if (action === "reconcile") {
        // Read the same owned order before offering a separate cancellation review.
        const current = await getCustomerApi().getOrder(order.id, { signal: controller.signal });
        if (controller.signal.aborted) return;
        updateCancellation(current.canCancel ? "idle" : "settled");
        setMessage(current.status === "CANCELLED" ? t("Order cancelled.", "မှာယူမှုကို ပယ်ဖျက်ပြီးပါပြီ။")
          : t("Order checked. Review the refreshed status before taking another action.", "မှာယူမှုကို စစ်ဆေးပြီးပါပြီ။ ဆက်မလုပ်မီ ပြန်ရယူထားသော အခြေအနေကို စစ်ဆေးပါ။"));
        reload();
      } else {
        const menu = await getCustomerPublicApi().getPublicMenu({ signal: controller.signal });
        if (controller.signal.aborted) return;
        const rebuilt = rebuildCart(menu, order.items);
        if (!rebuilt.lines.length) {
          setMessage(`${t("No items can be restored. Your current cart is unchanged.", "ပစ္စည်းများကို ပြန်မထည့်နိုင်ပါ။ လက်ရှိခြင်းတောင်း မပြောင်းလဲပါ။")} ${rebuilt.unavailable.join(" · ")}`);
          return;
        }
        reorderReview.current = rebuilt;
        setReorder(rebuilt);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = apiFailure(error, "order");
        if (action === "cancel" || action === "reconcile") updateCancellation("uncertain");
        setMessage(action === "cancel" || action === "reconcile"
          ? t("Cancellation could not be confirmed. Check the order result before another cancellation.", "ပယ်ဖျက်မှုကို အတည်မပြုနိုင်ပါ။ ထပ်မပယ်ဖျက်မီ မှာယူမှုရလဒ်ကို စစ်ဆေးပါ။")
          : apiFailureMessage(failure, t) ?? t("The current menu could not be loaded. Reconnect and try again.", "လက်ရှိမီနူးကို မဖွင့်နိုင်ပါ။ အင်တာနက်ပြန်ချိတ်ပြီး ထပ်ကြိုးစားပါ။"));
        if (action === "cancel") reload();
      }
    } finally {
      mutation.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        setConfirming(false);
      }
    }
  }

  return <>
    <Card title={order.orderNumber}>
      <Badge tone={orderStatusTone(order.status)}>{statusLabel(order.status, language)}</Badge>
      <Body tone="muted">{orderDate(order.createdAt, language)}</Body>
      <Body tone="muted">{t("Order ID", "မှာယူမှု ID")} · {order.id}</Body>
      {order.delivery ? <Status tone={orderStatusTone(order.delivery.status)}>{t("Delivery", "ပို့ဆောင်မှု")} · {statusLabel(order.delivery.status, language)}</Status> : null}
      <Action title={t("Refresh tracking", "အခြေအနေ ပြန်စစ်ရန်")} onPress={reload} secondary disabled={busy} loading={refreshing} />
    </Card>
    <Card title={t("Status timeline", "အခြေအနေ အဆင့်ဆင့်")}>
      <Body tone="muted">{t("Order progress", "မှာယူမှု အခြေအနေ")}</Body>
      {order.statusHistory.map((entry, index) => <Body key={`order:${index}`}>{statusLabel(entry.status, language)} · {orderDate(entry.changedAt, language)}</Body>)}
      {order.delivery ? <Body tone="muted">{t("Delivery progress", "ပို့ဆောင်မှု အခြေအနေ")}</Body> : null}
      {order.delivery?.statusHistory?.map((entry, index) => <Body key={`delivery:${index}`}>{statusLabel(entry.status, language)} · {orderDate(entry.changedAt, language)}</Body>)}
    </Card>
    <Card title={t("Original items", "မူလမှာယူထားသော ပစ္စည်းများ")}>
      <Body tone="muted">{t("The selections and prices recorded with this order.", "ဤမှာယူမှုနှင့်အတူ မှတ်တမ်းတင်ထားသော ရွေးချယ်မှုများနှင့် ဈေးနှုန်းများ။")}</Body>
      {order.items.map(item => <Card key={item.id} title={`${item.productName} × ${item.quantity}`}>
        {item.variantName ? <Body>{item.variantName}</Body> : null}
        <Body>{t("Original unit price", "မူလတစ်ခုချင်း ဈေးနှုန်း")} · {amount(item.unitPrice)}</Body>
        {item.modifiers.map(modifier => <Body key={modifier.id}>{modifier.name} × {modifier.quantity} · {amount(modifier.additionalPrice)}</Body>)}
        {item.specialInstruction ? <Body tone="muted">{item.specialInstruction}</Body> : null}
        <Body style={{ fontWeight: "600" }}>{amount(item.subtotal)}</Body>
      </Card>)}
    </Card>
    <Card title={t("Order total", "မှာယူမှု စုစုပေါင်းငွေ")}>
      <Body>{t("Subtotal", "ပစ္စည်း စုစုပေါင်း")} · {amount(order.subtotal)}</Body>
      <Body>{t("Delivery fee", "ပို့ဆောင်ခ")} · {amount(order.deliveryFee)}</Body>
      {order.discountAmount ? <Body>{t("Discount", "လျှော့ဈေး")} · {amount(order.discountAmount)}</Body> : null}
      <Body style={{ fontWeight: "600" }}>{t("Total", "စုစုပေါင်း")} · {amount(order.totalAmount)}</Body>
    </Card>
    <Card title={t("Payment record", "ငွေပေးချေမှု မှတ်တမ်း")}>
      {order.payments.length ? order.payments.map(payment => <Status key={payment.id} tone={payment.status === "PAID" ? "success" : "neutral"}>
        {payment.method === "CASH_ON_DELIVERY" ? t("Cash on delivery", "ပစ္စည်းရောက်မှ ငွေချေမည်")
          : payment.method === "CASH_AT_COUNTER" ? t("Cash at counter", "ကောင်တာတွင် ငွေသားပေးချေမည်") : payment.method}
        {"\n"}{paymentStatusLabel(payment.method, payment.status, language)} · {amount(payment.amount)}
        {payment.status === "PAID" && payment.paidAt ? `\n${orderDate(payment.paidAt, language)}` : ""}
      </Status>) : <Body>{t("No payment record is available.", "ငွေပေးချေမှု မှတ်တမ်း မရှိပါ။")}</Body>}
    </Card>
    {order.deliveryAddress ? <Card title={t("Confirmed delivery location", "အတည်ပြုထားသော ပို့ဆောင်မည့်နေရာ")}>
      {order.deliveryLocationSource && order.deliveryLocationSource !== "SAVED_ADDRESS"
        ? <Body tone="muted">{t("Temporary delivery location", "ယခုမှာယူမှုအတွက် ပို့ဆောင်မည့်နေရာ")}</Body> : null}
      <Body>{order.deliveryAddress}</Body>
      {order.deliveryName || order.deliveryPhone ? <Body>{[order.deliveryName, order.deliveryPhone].filter(Boolean).join(" · ")}</Body> : null}
      {order.deliveryNote ? <Body>{order.deliveryNote}</Body> : null}
      <DestinationPin latitude={order.deliveryLatitude} longitude={order.deliveryLongitude} language={language} />
    </Card> : null}
    <Card>
      <Action title={t("Notifications for this order", "ဤမှာယူမှုအတွက် အသိပေးချက်များ")} secondary
        onPress={() => router.push({ pathname: "/notifications", params: { orderId: order.id } })} />
      {order.canCancel && cancellation === "idle" ? <Action title={t("Cancel order", "မှာယူမှု ပယ်ဖျက်ရန်")} secondary disabled={busy} onPress={() => { cancellationReview.current = true; setConfirming(true); }} /> : null}
      {cancellation === "uncertain" ? <Action title={t("Check cancellation result", "ပယ်ဖျက်မှုရလဒ် စစ်ဆေးရန်")} onPress={() => void perform("reconcile")} loading={busy} /> : null}
      {order.orderType === "DELIVERY" && ["COMPLETED", "CANCELLED"].includes(order.status) ? <>
        <Body>{t("Reorder checks today's availability and prices. Review a new cart and checkout before placing another order.",
          "ထပ်မှာယူရန် ယနေ့ ရရှိနိုင်မှုနှင့် ဈေးနှုန်းများကို စစ်ဆေးပါမည်။ မှာယူမှုအသစ် မတင်မီ ခြင်းတောင်းနှင့် ငွေချေမှုကို စစ်ဆေးပါ။")}</Body>
        <Action title={t("Review reorder", "ထပ်မှာယူမှု စစ်ဆေးရန်")} onPress={() => void perform("reorder")} loading={busy} />
      </> : null}
      {message ? <Status tone={cancellation === "uncertain" ? "warning" : "neutral"}>{message}</Status> : null}
    </Card>
    <ConfirmDialog visible={confirming && order.canCancel && cancellation === "idle"} title={t("Cancel this order?", "ဤမှာယူမှုကို ပယ်ဖျက်မလား။")}
      message={`${order.orderNumber} · ${amount(order.totalAmount)}\n${t("The server rechecks cancellation eligibility. The original order and updates remain in your history.", "ဆာဗာက ပယ်ဖျက်ခွင့်ကို ပြန်စစ်ဆေးပါမည်။ မူလမှာယူမှုနှင့် အခြေအနေများကို မှတ်တမ်းတွင် ဆက်ကြည့်နိုင်ပါမည်။")}`}
      confirmLabel={t("Confirm cancellation", "ပယ်ဖျက်မှု အတည်ပြုရန်")} cancelLabel={t("Keep order", "မှာယူမှု ဆက်ထားရန်")}
      onConfirm={() => void perform("cancel")} onCancel={() => { if (!busy) { cancellationReview.current = false; setConfirming(false); } }} busy={busy} danger />
    <ConfirmDialog visible={reorder !== null} title={cart.items.length ? t("Replace your current cart?", "လက်ရှိခြင်းတောင်းကို အစားထိုးမလား။") : t("Review rebuilt cart", "ပြန်ထည့်မည့် ခြင်းတောင်း စစ်ဆေးရန်")}
      message={`${t("Available historical items use today's menu and prices. You must review a new destination and quote before checkout.", "ရရှိနိုင်သော မူလပစ္စည်းများကို ယနေ့မီနူးနှင့် ဈေးနှုန်းဖြင့် ပြန်ထည့်ပါမည်။ ငွေမချေမီ နေရာနှင့် ဈေးနှုန်းအသစ်ကို စစ်ဆေးရပါမည်။")}${reorder?.unavailable.length ? `\n${t("Unavailable", "မရနိုင်သော ပစ္စည်းများ")}: ${reorder.unavailable.join(" · ")}` : ""}`}
      confirmLabel={t("Review rebuilt cart", "ပြန်ထည့်မည့် ခြင်းတောင်း စစ်ဆေးရန်")} cancelLabel={t("Keep current cart", "လက်ရှိခြင်းတောင်း ဆက်ထားရန်")}
      onConfirm={() => { const reviewed = reorderReview.current; if (!reviewed?.lines.length || mutation.current) return; reorderReview.current = null; latest.current.cart.replace(reviewed.lines, reviewed.unavailable); setReorder(null); router.navigate("/cart"); }}
      onCancel={() => { reorderReview.current = null; setReorder(null); }} />
  </>;
}
