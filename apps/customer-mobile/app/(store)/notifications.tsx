import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";
import { getCustomerApi } from "../../src/api";
import { Action, Body, Card, Page, StateView } from "../../src/components/ui";
import { notificationTitle, orderDate } from "../../src/features/orders/presentation";
import { useApiQuery } from "../../src/hooks/useApiQuery";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../src/i18n";

export default function Notifications() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const { state, reload } = useApiQuery(signal => getCustomerApi().listNotifications(undefined, { signal }), "notifications");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);

  async function markRead(id: string) {
    if (mutation.current) return;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(id);
    setError(false);
    try { await getCustomerApi().markNotificationRead(id, { signal: controller.signal }); }
    catch { if (!controller.signal.aborted) setError(true); }
    finally {
      mutation.current = null;
      if (!controller.signal.aborted) { setBusy(null); reload(); }
    }
  }
  const notifications = state.status === "ready" ? state.data.filter(entry => !orderId || entry.orderId === orderId) : [];
  return <Page title={t("Notifications", "အသိပေးချက်များ")}>
    {state.status === "ready" ? <>
      {notifications.length ? notifications.map(entry => <Card key={entry.id} title={notificationTitle(entry.notificationType, entry.title, language)}>
        <Body>{entry.body}</Body>
        <Body>{orderDate(entry.createdAt, language)}</Body>
        {!entry.readAt ? <Action title={t("Mark as read", "ဖတ်ပြီးဟု မှတ်ရန်")} onPress={() => void markRead(entry.id)} disabled={busy !== null} secondary /> : null}
        {entry.orderId && !orderId ? <Action title={t("View order", "မှာယူမှု ကြည့်ရန်")}
          onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: entry.orderId! } })} /> : null}
      </Card>) : <Card><Body>{t("No notifications yet.", "အသိပေးချက် မရှိသေးပါ။")}</Body></Card>}
      <Action title={t("Refresh notifications", "အသိပေးချက်များ ပြန်ဖွင့်ရန်")} secondary onPress={reload} disabled={busy !== null} />
    </> : <StateView kind={state.status} title={queryStateLabel(state.status, t)}
      retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} onRetry={reload} />}
    {error ? <Text accessibilityRole="alert">{t("The update could not be confirmed. Try again.", "ပြင်ဆင်မှုကို အတည်မပြုနိုင်ပါ။ ထပ်ကြိုးစားပါ။")}</Text> : null}
    <Action title={t("Order history", "မှာယူမှုမှတ်တမ်း")} secondary onPress={() => router.navigate("/orders")} />
  </Page>;
}
