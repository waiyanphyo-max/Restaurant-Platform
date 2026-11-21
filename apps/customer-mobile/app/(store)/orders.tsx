import { useState } from "react";
import { useRouter } from "expo-router";
import { getCustomerApi } from "../../src/api";
import { Action, Badge, Body, Card, Page, StateView } from "../../src/components/ui";
import { orderAmount, orderDate, orderStatusTone, statusLabel } from "../../src/features/orders/presentation";
import { apiFailureMessage } from "../../src/hooks/apiFailure";
import { useApiQuery } from "../../src/hooks/useApiQuery";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../src/i18n";

export default function Orders() {
  const router = useRouter();
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const [page, setPage] = useState(0);
  const { state, reload } = useApiQuery(signal => getCustomerApi().listOrders({ page }, { signal }), `orders:${page}`);
  const retry = t("Try again", "ထပ်ကြိုးစားပါ");
  return <Page title={t("Your orders", "သင့်မှာယူမှုများ")} subtitle={t("Your orders for this restaurant", "ဤစားသောက်ဆိုင်မှ သင့်မှာယူမှုများ")} onRefresh={reload}>
    {state.status === "ready" ? <>
      {state.data.content.length ? state.data.content.map(order => <Card key={order.id} title={order.orderNumber}>
        <Badge tone={orderStatusTone(order.status)}>{statusLabel(order.status, language)}</Badge>
        <Body tone="muted">{orderDate(order.createdAt, language)}</Body>
        <Body style={{ fontWeight: "600" }}>{orderAmount(order.totalAmount, order.currency, language)}</Body>
        <Action title={t("View order and tracking", "မှာယူမှုနှင့် ပို့ဆောင်မှုအခြေအနေ ကြည့်ရန်")}
          onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: order.id } })} />
      </Card>) : <StateView kind="empty" title={page === 0 ? t("No orders yet", "မှာယူမှု မရှိသေးပါ") : t("No orders on this page", "ဤစာမျက်နှာတွင် မှာယူမှု မရှိပါ")}
        message={t("Confirmed orders from this restaurant will appear here.", "ဤစားသောက်ဆိုင်မှ အတည်ပြုပြီး မှာယူမှုများကို ဤနေရာတွင် ပြပါမည်။")} />}
      {page === 0 && !state.data.content.length ? <Action title={t("Explore the menu", "မီနူး ကြည့်ရန်")} onPress={() => router.navigate("/menu")} /> : null}
      {page > 0 ? <Action title={t("Previous page", "ယခင်စာမျက်နှာ")} onPress={() => setPage(page - 1)} secondary /> : null}
      {!state.data.last ? <Action title={t("Next page", "နောက်စာမျက်နှာ")} onPress={() => setPage(page + 1)} secondary /> : null}
      <Action title={t("Refresh orders", "မှာယူမှုများ ပြန်ဖွင့်ရန်")} secondary onPress={reload} />
    </> : <StateView kind={state.status === "denied" && state.failure?.kind === "forbidden" ? "forbidden" : state.status}
      title={state.status === "denied" && state.failure?.kind === "forbidden" ? t("Unable to open your orders", "သင့်မှာယူမှုများ မဖွင့်နိုင်ပါ") : queryStateLabel(state.status, t)}
      message={"failure" in state ? apiFailureMessage(state.failure, t) : undefined} retryLabel={retry} onRetry={reload} />}
    <Action title={t("Notifications", "အသိပေးချက်များ")} secondary onPress={() => router.push("/notifications")} />
  </Page>;
}
