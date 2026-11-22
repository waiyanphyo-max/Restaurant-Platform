import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Choices } from "../management/controls";
import { ExpenseScreen } from "./ExpenseCashScreens";
import { CashbookScreen, DailyCashClosingScreen } from "./CashbookScreens";
import { AccountingAuditScreen } from "./AccountingAuditScreen";
import { FinancialRequestKeys } from "./financial-requests";
import { Action, Body, Card, Page } from "../../components/ui";
import { RouteAction } from "../../navigation/RouteAction";
import { useOperationsText } from "../../navigation/OperationsLanguage";
import { useDraftNavigation } from "../../hooks/useUnsavedChanges";
import { FinancialOverviewScreen } from "../operations/ReportsScreen";

const views = ["overview", "expenses", "cashbook", "closing", "audit"] as const;

export function AccountingScreen() {
  const [workspace, setWorkspace] = useState<typeof views[number]>("overview");
  const [requestKeys] = useState(() => new FinancialRequestKeys());
  const t = useOperationsText();
  const { requestNavigation } = useDraftNavigation();
  const labels = { overview: t("Finance", "ဘဏ္ဍာရေး"), expenses: t("Expense Register", "အသုံးစရိတ်စာရင်း"),
    cashbook: t("Cashbook", "ငွေသားစာရင်း"), closing: t("Daily Cash Closing", "နေ့စဉ်ငွေသားပိတ်စာရင်း"), audit: t("Audit History", "စစ်ဆေးမှုမှတ်တမ်း") };
  const navigate = (value: typeof views[number]) => requestNavigation(() => setWorkspace(value));
  return <View style={styles.container}>
    <View style={styles.navigation}>
      <Choices label={t("Accounting workspace", "ငွေစာရင်းလုပ်ငန်းခွင်")} value={workspace} values={views} labels={labels} onChange={navigate} />
    </View>
    {workspace === "overview" ? <Page title={t("Finance", "ဘဏ္ဍာရေး")} subtitle={t("Sales, obligations and actual money events", "ရောင်းအား၊ ပေးရန်တာဝန်နှင့် အမှန်တကယ် ငွေလှုပ်ရှားမှု")}>
      <FinancialOverviewScreen />
      <Card title={t("Financial records", "ဘဏ္ဍာရေးမှတ်တမ်းများ")}>
        <RouteAction title={t("Sales history", "အရောင်းမှတ်တမ်း")} href="/sales-history" />
        <RouteAction title={t("Purchases & suppliers", "ဝယ်ယူမှုနှင့် ပေးသွင်းသူများ")} href="/purchasing" secondary />
        <Action title={t("Cashbook & daily closing", "ငွေသားစာရင်းနှင့် နေ့စဉ်ပိတ်စာရင်း")} onPress={() => navigate("cashbook")} secondary />
        <Action title={t("Expenses", "အသုံးစရိတ်များ")} onPress={() => navigate("expenses")} secondary />
        <Action title={t("Audit history", "စစ်ဆေးမှုမှတ်တမ်း")} onPress={() => navigate("audit")} secondary />
        <RouteAction title={t("Reports & private exports", "အစီရင်ခံစာနှင့် သီးသန့်ထုတ်ယူမှု")} href="/reports" secondary />
      </Card>
      <Card title={t("Keep history traceable", "မှတ်တမ်းခြေရာကို ထိန်းသိမ်းပါ")}><Body>{t("Posted records retain their source, actor and actual timestamp when recorded. Corrections append to the original history.", "တင်ပြီးမှတ်တမ်းများ၏ မူရင်း၊ လုပ်ဆောင်သူနှင့် မှတ်တမ်းပါ အချိန်ကို ထိန်းသိမ်းထားသည်။ ပြင်ဆင်မှုများကို မူရင်းမှတ်တမ်းတွင် ဆက်လက်ဖြည့်စွက်သည်။")}</Body></Card>
    </Page> : null}
    {workspace === "expenses" ? <ExpenseScreen requestKeys={requestKeys} /> : null}
    {workspace === "cashbook" ? <CashbookScreen requestKeys={requestKeys} /> : null}
    {workspace === "closing" ? <DailyCashClosingScreen requestKeys={requestKeys} /> : null}
    {workspace === "audit" ? <AccountingAuditScreen /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navigation: { width: "100%", maxWidth: 1000, alignSelf: "center", paddingHorizontal: 20, paddingTop: 16 }
});
