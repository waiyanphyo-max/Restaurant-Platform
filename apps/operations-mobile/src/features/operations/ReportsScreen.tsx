import { useState } from "react";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, Page, Status } from "../../components/ui";
import { useOperationsText } from "../../navigation/OperationsLanguage";
import { FinanceMetric } from "../accounting/FinanceMetric";
import { useApiQuery } from "../../hooks/useApiQuery";
import { ExportReportsScreen } from "../accounting/ExportReportsScreen";
import { FinancialPeriodForm } from "../accounting/FinancialPeriodFields";
import { SalesDashboardPanel, SalesTotals } from "../accounting/SalesDashboardPanel";
import { Choices } from "../management/controls";

export function FinancialOverviewScreen() {
  const t = useOperationsText();
  const query = useApiQuery(signal => getOperationsApi().getFinancialReport(undefined, undefined, { signal }), "financial-overview");
  return <>
    <QueryResult {...query}>{report => <>
      <Card title={t("Reporting period", "အစီရင်ခံစာကာလ")}>
        <Body>{report.from} → {report.to} · {report.timezone}</Body>
        <Body tone="muted">{t("Restaurant-local dates · Whole currency units", "ဆိုင်၏ ဒေသစံရက်စွဲ · ငွေကြေးယူနစ်အပြည့်")} · {report.currency}</Body>
      </Card>
      <SalesTotals title={t("Sales and collections", "ရောင်းအားနှင့် ကောက်ခံငွေ")} value={report.sales} currency={report.currency} />
      <Card title={t("Purchases and operating expenses", "ဝယ်ယူမှုနှင့် လုပ်ငန်းအသုံးစရိတ်")}>
        <FinanceMetric label={t("Confirmed purchases", "အတည်ပြုဝယ်ယူမှု")} amount={report.confirmedPurchases} currency={report.currency} />
        <FinanceMetric label={t("Registered operating expenses", "မှတ်တမ်းတင်လုပ်ငန်းအသုံးစရိတ်")} amount={report.registeredOperatingExpenses} currency={report.currency} />
        <Body tone="muted">{t("Obligations recorded in this period. Payments are separate actual events.", "ဤကာလအတွင်း မှတ်တမ်းတင်ထားသော ပေးရန်တာဝန်များဖြစ်သည်။ ငွေပေးချေမှုကို သီးခြားမှတ်တမ်းတင်သည်။")}</Body>
      </Card>
      <Status>{t("These figures are not profit or a reconciled physical cash balance.", "ဤကိန်းဂဏန်းများသည် အမြတ် သို့မဟုတ် တိုက်စစ်ပြီး လက်ဝယ်ငွေလက်ကျန် မဟုတ်ပါ။")}</Status>
    </>}</QueryResult>
    <Action title="Refresh financial overview" secondary onPress={query.reload} disabled={query.state.status === "loading"} />
  </>;
}

export function FinancialSummaryScreen() {
  const t = useOperationsText();
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({});
  const query = useApiQuery(signal => getOperationsApi().getFinancialReport(period.from, period.to, { signal }), `financial-report:${period.from}:${period.to}`);
  return <>
    <FinancialPeriodForm onApply={value => { setPeriod(value); query.reload(); }} />
    <QueryResult {...query}>{report => <>
      <Card title={t("Reporting basis", "အစီရင်ခံစာအခြေခံ")}><Body>{report.from} → {report.to} · {report.timezone} · {report.currency}</Body></Card>
      <SalesTotals title={t("Sales and collections", "ရောင်းအားနှင့် ကောက်ခံငွေ")} value={report.sales} currency={report.currency} />
      <Card title="Trading payments and expenses">
        <FinanceMetric label={t("Confirmed purchases", "အတည်ပြုဝယ်ယူမှု")} amount={report.confirmedPurchases} currency={report.currency} />
        <FinanceMetric label={t("Registered operating expenses", "မှတ်တမ်းတင်လုပ်ငန်းအသုံးစရိတ်")} amount={report.registeredOperatingExpenses} currency={report.currency} />
        <FinanceMetric label={t("Purchase payments less reversals", "ပြန်လှန်မှုနုတ်ပြီး ဝယ်ယူငွေပေးချေမှု")} amount={report.purchasePayments} currency={report.currency} />
        <FinanceMetric label={t("Expense payments less reversals", "ပြန်လှန်မှုနုတ်ပြီး အသုံးစရိတ်ငွေပေးချေမှု")} amount={report.expensePayments} currency={report.currency} />
        <FinanceMetric label={t("Trading payment net", "ကုန်သွယ်ငွေပေးချေမှု အသားတင်")} amount={report.tradingPaymentNet} currency={report.currency} />
        <Body>{t("This partial trading payment view includes cash and non-cash settlements for sales, purchases and expenses. Other cash movements and capital activity are outside its scope.", "ဤတစ်စိတ်တစ်ပိုင်း ကုန်သွယ်ငွေပေးချေမှုတွင် ရောင်းအား၊ ဝယ်ယူမှုနှင့် အသုံးစရိတ်ဆိုင်ရာ ငွေသားနှင့် ဒစ်ဂျစ်တယ်ပေးချေမှုများ ပါဝင်သည်။ အခြားငွေရွှေ့ပြောင်းမှုနှင့် အရင်းအနှီးလုပ်ဆောင်မှု မပါဝင်ပါ။")}</Body>
      </Card>
      <Card title="Operating expenses by category">
        {report.expensesByCategory.length ? report.expensesByCategory.map(category =>
          <FinanceMetric key={category.category} label={category.category.replaceAll("_", " ")} amount={category.amount} currency={report.currency} />
        ) : <Body>No operating expenses were registered in this period.</Body>}
      </Card>
      <Card title={t("Profit figures unavailable", "အမြတ်ကိန်းဂဏန်း မရရှိနိုင်ပါ")}>
        <Status tone="warning">{t("COGS, gross profit and net operating profit are unavailable. Purchases are not inventory cost consumed.", "ကုန်ရောင်းတန်ဖိုး၊ စုစုပေါင်းအမြတ်နှင့် လုပ်ငန်းအသားတင်အမြတ် မရရှိနိုင်ပါ။ ဝယ်ယူမှုသည် သုံးစွဲပြီး ကုန်ကျစရိတ် မဟုတ်ပါ။")}</Status>
        {report.missingInputs.map(input => <Body key={input}>{input}</Body>)}
      </Card>
    </>}</QueryResult>
    <Action title="Refresh financial summary" secondary onPress={query.reload} disabled={query.state.status === "loading"} />
  </>;
}

const reportViews = {
  OVERVIEW: "Financial overview",
  SALES: "Sales reports",
  SUMMARY: "Financial summary",
  EXPORT: "Export reports"
} as const;

export function ReportsScreen() {
  const [view, setView] = useState<keyof typeof reportViews>("OVERVIEW");
  return <Page title={reportViews[view]} subtitle="Restaurant sales, collections, expenses and report exports">
    <Card title="Financial reporting">
      <Choices<keyof typeof reportViews> label="Report view" value={view} values={["OVERVIEW", "SALES", "SUMMARY", "EXPORT"]} onChange={setView} labels={reportViews} />
    </Card>
    {view === "OVERVIEW" ? <FinancialOverviewScreen /> : view === "SALES" ? <SalesDashboardPanel /> :
      view === "SUMMARY" ? <FinancialSummaryScreen /> : <ExportReportsScreen />}
  </Page>;
}
