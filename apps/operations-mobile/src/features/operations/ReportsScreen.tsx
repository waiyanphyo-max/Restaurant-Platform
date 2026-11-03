import { useState } from "react";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { ExportReportsScreen } from "../accounting/ExportReportsScreen";
import { FinancialPeriodForm } from "../accounting/FinancialPeriodFields";
import { SalesDashboardPanel, SalesTotals } from "../accounting/SalesDashboardPanel";
import { salesAmount } from "../accounting/salesApi";
import { Choices } from "../management/controls";

export function FinancialOverviewScreen() {
  const query = useApiQuery(signal => getOperationsApi().getFinancialReport(undefined, undefined, { signal }), "financial-overview");
  return <>
    <QueryResult {...query}>{report => <>
      <Card title="Reporting basis"><Body>{report.timezone} · All amounts in whole {report.currency} units.</Body></Card>
      <SalesTotals title="Today in this restaurant" value={report.sales} />
      <Card title="Today's purchases and operating expenses">
        <Body>Confirmed purchases {salesAmount(report.confirmedPurchases)}</Body>
        <Body>Registered operating expenses {salesAmount(report.registeredOperatingExpenses)}</Body>
      </Card>
    </>}</QueryResult>
    <Action title="Refresh financial overview" secondary onPress={query.reload} disabled={query.state.status === "loading"} />
  </>;
}

export function FinancialSummaryScreen() {
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({});
  const query = useApiQuery(signal => getOperationsApi().getFinancialReport(period.from, period.to, { signal }), `financial-report:${period.from}:${period.to}`);
  return <>
    <FinancialPeriodForm onApply={value => { setPeriod(value); query.reload(); }} />
    <QueryResult {...query}>{report => <>
      <Card title="Reporting basis"><Body>{report.timezone} · All amounts in whole {report.currency} units.</Body></Card>
      <SalesTotals title="Sales and collections" value={report.sales} />
      <Card title="Trading payments and expenses">
        <Body>Confirmed purchases {salesAmount(report.confirmedPurchases)}</Body>
        <Body>Registered operating expenses {salesAmount(report.registeredOperatingExpenses)}</Body>
        <Body>Purchase payments less reversals {salesAmount(report.purchasePayments)}</Body>
        <Body>Expense payments less reversals {salesAmount(report.expensePayments)}</Body>
        <Body>Trading payment net {salesAmount(report.tradingPaymentNet)}</Body>
        <Body>This partial cash-flow view includes cash and non-cash settlements for sales, purchases and expenses. Other cash movements and capital activity are outside its scope.</Body>
      </Card>
      <Card title="Operating expenses by category">
        {report.expensesByCategory.length ? report.expensesByCategory.map(category =>
          <Body key={category.category}>{category.category.replaceAll("_", " ")} · {salesAmount(category.amount)}</Body>
        ) : <Body>No operating expenses were registered in this period.</Body>}
      </Card>
      <Card title="Profit figures unavailable">
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
