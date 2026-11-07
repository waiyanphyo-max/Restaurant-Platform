import { useState } from "react";
import { useRouter } from "expo-router";
import { getCustomerApi } from "../../src/api";
import { Action, Body, Card, Page, StateView } from "../../src/components/ui";
import { orderAmount, orderDate, statusLabel } from "../../src/features/orders/presentation";
import { useApiQuery } from "../../src/hooks/useApiQuery";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../src/i18n";

export default function Orders() {
  const router = useRouter();
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const [page, setPage] = useState(0);
  const { state, reload } = useApiQuery(signal => getCustomerApi().listOrders({ page }, { signal }), `orders:${page}`);
  const retry = t("Try again", "ထပ်ကြိုးစားပါ");
  return <Page title={t("Order history", "မှာယူမှုမှတ်တမ်း")}>
    <Action title={t("Notifications", "အသိပေးချက်များ")} secondary onPress={() => router.push("/notifications")} />
    {state.status === "ready" ? <>
      {state.data.content.length ? state.data.content.map(order => <Card key={order.id} title={order.orderNumber}>
        <Body>{orderDate(order.createdAt, language)}</Body>
        <Body>{statusLabel(order.status, language)} · {orderAmount(order.totalAmount, order.currency, language)}</Body>
        <Action title={t("View order and tracking", "မှာယူမှုနှင့် ပို့ဆောင်မှုအခြေအနေ ကြည့်ရန်")}
          onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: order.id } })} />
      </Card>) : <Card><Body>{t("No orders on this page.", "ဤစာမျက်နှာတွင် မှာယူမှု မရှိပါ။")}</Body></Card>}
      {page > 0 ? <Action title={t("Previous page", "ယခင်စာမျက်နှာ")} onPress={() => setPage(page - 1)} secondary /> : null}
      {!state.data.last ? <Action title={t("Next page", "နောက်စာမျက်နှာ")} onPress={() => setPage(page + 1)} secondary /> : null}
      <Action title={t("Refresh orders", "မှာယူမှုများ ပြန်ဖွင့်ရန်")} secondary onPress={reload} />
    </> : <StateView kind={state.status} title={queryStateLabel(state.status, t)} retryLabel={retry} onRetry={reload} />}
  </Page>;
}
