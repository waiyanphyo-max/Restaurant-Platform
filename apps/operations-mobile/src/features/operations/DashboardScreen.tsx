import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { useRuntimeBranding } from "../../branding/RuntimeBrandingProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Badge, Body, Card, Page, Status, useUiTheme } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useOperationsText } from "../../navigation/OperationsLanguage";
import { getValidatedRole } from "../../navigation/policy";
import { readEmbeddedTenant } from "../../tenant";
import { loadDashboardOverview, type DashboardSection } from "./dashboard-overview";
import { operationalAmount } from "./format";

function SectionUnavailable({ result }: { result: Exclude<DashboardSection<unknown>, { status: "ready" }> }) {
  const t = useOperationsText();
  return <Status tone={result.status === "denied" ? "danger" : "warning"}>{result.status === "denied"
    ? t("This overview is unavailable for your account. Contact your restaurant owner for access.", "ဤအချက်အလက်ကို ကြည့်ရန် ခွင့်ပြုချက်မရှိပါ။ ဆိုင်ပိုင်ရှင်ကို ဆက်သွယ်ပါ။")
    : result.status === "offline" ? t("This section could not be loaded. Reconnect, then refresh the overview.", "ဤအပိုင်းကို မဖွင့်နိုင်ပါ။ အင်တာနက်ပြန်ချိတ်ပြီး စာမျက်နှာကို ပြန်တင်ပါ။")
    : t("This section is unavailable. Refresh the overview to check again.", "ဤအပိုင်းကို မရရှိနိုင်ပါ။ ပြန်တင်ပြီး စစ်ဆေးပါ။")}</Status>;
}

export function DashboardScreen() {
  const { state } = useOperationsAuth();
  const { displayName } = useRuntimeBranding();
  const { color } = useUiTheme();
  const t = useOperationsText();
  const role = state.status === "ready" ? getValidatedRole(state.membership, readEmbeddedTenant().restaurantId) : null;
  const query = useApiQuery(signal => {
    if (!role) return Promise.reject(new Error("Restaurant membership unavailable"));
    return loadDashboardOverview(getOperationsApi(), role, signal);
  }, `dashboard:${role}`);
  if (!role) return null;
  const management = ["OWNER", "MANAGER"].includes(role);
  const operational = role !== "DELIVERY_DRIVER";
  const countLabels = [t("New orders", "အော်ဒါအသစ်"), t("Accepted", "လက်ခံပြီး"), t("Preparing", "ပြင်ဆင်နေ"),
    t("Ready for handoff", "လွှဲပေးရန် အသင့်"), t("Out for delivery", "ပို့ဆောင်နေ")];
  return <Page title={t(role === "STAFF" ? "Ready for service" : role === "DELIVERY_DRIVER" ? "Your delivery workspace" : "Today at a glance",
    role === "DELIVERY_DRIVER" ? "သင့်ပို့ဆောင်ရေး လုပ်ငန်းခွင်" : "ယနေ့လုပ်ငန်း အခြေအနေ")}
    subtitle={displayName} onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <QueryResult {...query}>{data => <>
      {operational ? <>
        <Card title={t("Orders needing attention", "ဆောင်ရွက်ရန် အော်ဒါများ")}>
          {data.orders ? <>
            <View style={styles.metrics}>{data.orders.map((result, index) => <View key={countLabels[index]}
              style={[styles.metric, { backgroundColor: color.surfaceMuted }]}>
              <Body tone="muted">{countLabels[index]}</Body>
              {result.status === "ready" ? <Body style={styles.count}>{result.data}</Body>
                : <Body tone={result.status === "denied" ? "danger" : "warning"}>{t("Unavailable", "မရရှိနိုင်ပါ")}</Body>}
            </View>)}</View>
            {data.orders.some(result => result.status !== "ready") ? <Body tone="warning">{t("Some order counts could not be loaded. Available counts are shown above.",
              "အချို့အော်ဒါအရေအတွက် မရရှိပါ။ ရရှိသော အရေအတွက်များကို ဖော်ပြထားသည်။")}</Body> : null}
            {data.orders.every(result => result.status === "ready" && result.data === 0) ? <Body>{t("No active orders right now.", "လက်ရှိ ဆောင်ရွက်ရန်အော်ဒါ မရှိပါ။")}</Body> : null}
          </> : null}
          <Link href="/orders" style={[styles.link, { color: color.primary }]}>{t("Review orders", "အော်ဒါများကို စစ်ဆေးရန်")}</Link>
        </Card>
        <Link href="/orders" style={[styles.shortcut, { backgroundColor: color.secondary, color: color.onSecondary }]}>{t("Create counter order", "ကောင်တာအော်ဒါ ဖန်တီးရန်")}</Link>
        <Card title={t("Queue and pickup", "လာယူရန် စောင့်ဆိုင်းစာရင်း")}>
          {data.queue?.status === "ready" ? <>
            <Body>{data.queue.data.filter(ticket => ["WAITING", "READY", "CALLED"].includes(ticket.status)).length} {t("active tickets in the restaurant's current queue day", "ဆိုင်၏ ယနေ့ စောင့်ဆိုင်းမှုများ")}</Body>
            <Body>{data.queue.data.filter(ticket => ticket.status === "READY").length} {t("ready", "အသင့်ဖြစ်ပြီ")} · {data.queue.data.filter(ticket => ticket.status === "CALLED").length} {t("called", "ခေါ်ပြီး")}</Body>
            <Body tone="muted">{t("Calling a ticket and confirming physical pickup are separate actions.", "နံပါတ်ခေါ်ခြင်းနှင့် အမှန်တကယ်လာယူမှု အတည်ပြုခြင်းသည် သီးခြားလုပ်ဆောင်ချက်များ ဖြစ်သည်။")}</Body>
          </> : data.queue ? <SectionUnavailable result={data.queue} /> : null}
          <Link href="/queue" style={[styles.link, { color: color.primary }]}>{t("Open pickup queue", "စောင့်ဆိုင်းစာရင်းကို ဖွင့်ရန်")}</Link>
        </Card>
      </> : null}
      <Card title={t(management ? "Delivery activity" : "Your delivery activity", "ပို့ဆောင်ရေး အခြေအနေ")}>
        {data.assignment ? data.assignment.status === "ready"
          ? <Status tone={data.assignment.data > 0 ? "warning" : "neutral"}>{data.assignment.data} {t("waiting for assignment", "တာဝန်ပေးရန် စောင့်နေသည်")}</Status>
          : <SectionUnavailable result={data.assignment} /> : null}
        {data.deliveries.status === "ready" ? <>
          <Body>{data.deliveries.data.totalElements} {t(management ? "delivery records for this restaurant" : "delivery records assigned to you", management ? "ဆိုင်၏ ပို့ဆောင်ရေးမှတ်တမ်းများ" : "သင့်အတွက် တာဝန်ပေးထားသော မှတ်တမ်းများ")}</Body>
          {data.deliveries.data.content.length ? data.deliveries.data.content.map(delivery => <View key={delivery.id} style={styles.delivery}>
            <Body>{delivery.orderNumber}</Body><Badge>{delivery.status.replaceAll("_", " ")}</Badge>
          </View>) : <Body>{t("No deliveries found.", "ပို့ဆောင်ရေးတာဝန် မရှိပါ။")}</Body>}
        </> : <SectionUnavailable result={data.deliveries} />}
        <Link href="/deliveries" style={[styles.link, { color: color.primary }]}>{t(management ? "Open deliveries" : "Open your assigned tasks", "ပို့ဆောင်ရေးတာဝန်များကို ဖွင့်ရန်")}</Link>
      </Card>
      {management && data.daily ? <Card title={t("Today's restaurant operations", "ဆိုင်၏ ယနေ့ လုပ်ငန်းများ")}>
        {data.daily.status === "ready" ? <>
          <Body>{data.daily.data.reportDate} · {data.daily.data.timezone}</Body>
          <Body>{data.daily.data.totalOrders} {t("created", "ဖန်တီးပြီး")} · {data.daily.data.completedOrders} {t("completed", "ပြီးစီးပြီး")} · {data.daily.data.cancelledOrders} {t("cancelled", "ပယ်ဖျက်ပြီး")}</Body>
          <Body>{t("Value of orders created today, excluding cancellations", "ယနေ့ဖန်တီးသော အော်ဒါတန်ဖိုး (ပယ်ဖျက်မှုမပါ)")}: {operationalAmount(data.daily.data.orderAmountExcludingCancelled)}</Body>
          <Body tone="muted">{t("Order value is separate from physical cash collection. Use authorized financial reports for accounting measures.", "အော်ဒါတန်ဖိုးနှင့် အမှန်တကယ်ငွေလက်ခံမှုသည် သီးခြားဖြစ်သည်။ ဘဏ္ဍာရေးအစီရင်ခံစာတွင် စာရင်းများကို ကြည့်ပါ။")}</Body>
        </> : <><Body>{t("Today's operational totals are unavailable.", "ယနေ့လုပ်ငန်း အချက်အလက်များ မရရှိနိုင်ပါ။")}</Body><SectionUnavailable result={data.daily} /></>}
        <Link href="/reports" style={[styles.link, { color: color.primary }]}>{t("Open shared financial reports", "ဘဏ္ဍာရေး အစီရင်ခံစာများကို ဖွင့်ရန်")}</Link>
      </Card> : null}
      <Card title={t("Updates", "အသိပေးချက်များ")}>
        {data.notifications.status === "ready" ? <>
          <Body>{data.notifications.data.length} {t("unread updates", "မဖတ်ရသေးသော အသိပေးချက်များ")}</Body>
          {data.notifications.data.slice(0, 3).map(item => <Body key={item.id}>{item.title}</Body>)}
        </> : <SectionUnavailable result={data.notifications} />}
        <Link href="/notifications" style={[styles.link, { color: color.primary }]}>{t("View updates", "အသိပေးချက်များ ကြည့်ရန်")}</Link>
      </Card>
      <Action title={t("Refresh overview", "အခြေအနေကို ပြန်တင်ရန်")} secondary onPress={query.reload} />
    </>}</QueryResult>
  </Page>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { flexGrow: 1, flexBasis: 130, minWidth: 0, borderRadius: 12, padding: 12, gap: 4 },
  count: { ...foundationTokens.typography.heading }, link: { ...foundationTokens.typography.body, minHeight: 48, paddingVertical: 12 },
  shortcut: { ...foundationTokens.typography.body, minHeight: 54, padding: 16, borderRadius: 12, fontWeight: "600", textAlign: "center" },
  delivery: { gap: 4, paddingVertical: 8 },
});
