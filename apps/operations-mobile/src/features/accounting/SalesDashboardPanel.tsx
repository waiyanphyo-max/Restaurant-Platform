import { useState } from "react";
import type { SalesSummary, SalesTrend } from "@restaurant-platform/shared-types";
import { QueryResult } from "../../components/QueryResult";
import { Action, BarChart, Body, Card, DataTable, FormField } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { AccountingCsvAction } from "./AccountingCsvAction";
import { FinanceMetric } from "./FinanceMetric";
import { isFinancialDate, isFinancialMonth, isFinancialYear } from "./financial-period";
import { getSalesApi, salesAmount } from "./salesApi";

const exportPeriods = ["selectedDay", "selectedMonth", "selectedYear"] as const;
const exportLabels = { selectedDay: "Selected day", selectedMonth: "Selected month", selectedYear: "Selected year" };

/** Convert only the bounded bar ratio to a number, keeping the amounts exact. */
function netSalesChartPoints(trend: readonly SalesTrend[]) {
  const amounts = trend.map(point => BigInt(point.netSales));
  const max = amounts.reduce((highest, amount) => amount > highest ? amount : highest, 1n);
  return trend.map((point, index) => ({
    label: point.period,
    value: Number(amounts[index] * 10_000n / max),
    displayValue: salesAmount(point.netSales)
  }));
}

export function SalesTotals({ title,value,currency="" }: { title: string; value: SalesSummary; currency?: string }) {
  return <Card title={`${title} · ${value.from} to ${value.to}`}>
    <FinanceMetric label="Gross sales · စုစုပေါင်းအရောင်း" amount={value.grossSales} currency={currency}/><FinanceMetric label="Discounts · လျှော့ဈေး" amount={value.discounts} currency={currency}/>
    <FinanceMetric label="Net sales before refunds · ပြန်အမ်းငွေ မနုတ်မီအရောင်း" amount={value.netSales} currency={currency}/><FinanceMetric label="Collected payments · လက်ခံရရှိငွေ" amount={value.collectedPayments} currency={currency}/>
    <FinanceMetric label="Outstanding on these orders · ရရန်ကျန်ငွေ" amount={value.outstandingPayments} currency={currency}/><FinanceMetric label="Refunds less dated reversals · အသားတင်ပြန်အမ်းငွေ" amount={value.refundedAmounts} currency={currency}/>
    <Body>{value.orders} orders · {value.productsSold} products sold · {value.cancelledOrders} cancelled orders</Body>
    <Body tone="muted">Order-cohort net sales include unpaid orders. Collections use actual payment times; refunds and reversals use their own event times. အရောင်းနှင့် လက်ခံငွေကို သီးခြားတွက်ချက်ထားပါသည်။</Body>
    {value.legacyRefundsWithoutEventTime!=="0" ? <Body>Legacy refunds with unknown event date: {salesAmount(value.legacyRefundsWithoutEventTime)}</Body> : null}
  </Card>;
}
export function SalesDashboardPanel() {
  const [date,setDate]=useState(""); const [month,setMonth]=useState(""); const [year,setYear]=useState("");
  const [exportPeriod, setExportPeriod] = useState<typeof exportPeriods[number]>("selectedDay");
  const [filters,setFilters]=useState<{date?: string;month?: string;year?: number}>({});
  const [error,setError]=useState("");
  const query=useApiQuery(signal=>getSalesApi().getDashboard(filters,{signal}),`sales-dashboard:${JSON.stringify(filters)}`);
  function apply() {
    if (date && !isFinancialDate(date) || month && !isFinancialMonth(month) || year && !isFinancialYear(year)) {
      setError("Use YYYY-MM-DD, YYYY-MM and YYYY within years 1900 through 9998.");
      return;
    }
    setError(""); setFilters({date:date||undefined,month:month||undefined,year:year?parseInt(year,10):undefined}); query.reload();
  }
  return <>
    <Card title="Sales report periods">
      <Body>Leave fields blank for current restaurant dates. Sales follow the order creation date. Collections, refunds and reversals follow their own transaction dates.</Body>
      <FormField label="Selected sales day (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" maxLength={10} />
      <FormField label="Trend month (YYYY-MM)" value={month} onChangeText={setMonth} autoCapitalize="none" maxLength={7} />
      <FormField label="Trend year (YYYY)" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} error={error||undefined} />
      <Action title="Load sales reports" onPress={apply} />
      <Action title="Refresh sales reports" secondary onPress={query.reload} disabled={query.state.status === "loading"} />
    </Card>
    <QueryResult {...query}>{report=><>
      <Card><Body>{report.timezone} · All amounts in whole {report.currency} units.</Body></Card>
      {report.missingInputs.length ? <Card title="Data confidence · အချက်အလက် ပြည့်စုံမှု">{report.missingInputs.map((value, index) => <Body key={index}>{value}</Body>)}
        <Body>Unavailable inputs are not zero. မရရှိသော အချက်အလက်ကို သုညဟု မယူဆပါ။</Body></Card> : null}
      <SalesTotals title="Today" value={report.today} currency={report.currency}/><SalesTotals title="Selected day" value={report.selectedDay} currency={report.currency}/>
      <SalesTotals title="Selected month" value={report.selectedMonth} currency={report.currency}/><SalesTotals title="Selected year" value={report.selectedYear} currency={report.currency}/>
      <Card title="Daily sales trend"><DataTable columns={["Day","Net sales","Discounts","Orders","Quantity"]} rows={report.dailyTrend.map(point=>({key:point.period,cells:[point.period,salesAmount(point.netSales),salesAmount(point.discounts),point.orders,point.productsSold]}))}/></Card>
      <Card title="Monthly sales trend"><DataTable columns={["Month","Net sales","Discounts","Orders","Quantity"]} rows={report.monthlyTrend.map(point=>({key:point.period,cells:[point.period,salesAmount(point.netSales),salesAmount(point.discounts),point.orders,point.productsSold]}))}/>
        {report.monthlyTrend.length ? <><BarChart label={`Monthly net sales before refunds (${report.currency})`} points={netSalesChartPoints(report.monthlyTrend)} />
        <BarChart label="Monthly order counts" points={report.monthlyTrend.map(point=>({label:point.period,value:point.orders}))}/></> : <Body>No monthly series returned · လစဉ်မှတ်တမ်း မရရှိပါ။</Body>}</Card>
      <Card title="Top products in selected month"><Body>Historical item line totals include modifiers before order discounts and delivery fees. This ranking does not change the restaurant's Featured selection. မူလကုန်ပစ္စည်း အရောင်းစာရင်းဖြစ်ပါသည်။</Body><DataTable columns={["Historical product","Quantity","Sales before order discounts"]} rows={report.topProducts.map(point=>({key:`${point.productId}:${point.historicalName}`,cells:[point.historicalName,point.quantity,salesAmount(point.lineSalesBeforeOrderDiscounts)]}))}/></Card>
      <Card title="Export the selected sales period">
        <Choices label="Sales export period" value={exportPeriod} values={exportPeriods} labels={exportLabels} onChange={setExportPeriod} />
        <Body>{report[exportPeriod].from} through {report[exportPeriod].to}. The CSV contains orders created in this period and their transaction history.</Body>
        <AccountingCsvAction key={exportPeriod} report="sales-ledger" scopeDescription={`${report[exportPeriod].from} through ${report[exportPeriod].to} · ${report.timezone} · ${report.currency}. All matching order history · ကိုက်ညီသော အော်ဒါမှတ်တမ်းအားလုံး။`} fetchCsv={signal => {
          const { from, to } = report[exportPeriod];
          return getSalesApi().exportCsv({ from, to }, { signal });
        }} />
      </Card>
      <Card title="Metric definitions">{Object.entries(report.definitions).map(([key,value])=><Body key={key}>{value}</Body>)}</Card>
    </>}</QueryResult>
  </>;
}
