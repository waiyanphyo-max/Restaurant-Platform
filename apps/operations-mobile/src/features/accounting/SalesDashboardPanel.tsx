import { useState } from "react";
import type { SalesSummary, SalesTrend } from "@restaurant-platform/shared-types";
import { QueryResult } from "../../components/QueryResult";
import { Action, BarChart, Body, Card, DataTable, FormField } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { AccountingCsvAction } from "./AccountingCsvAction";
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

export function SalesTotals({ title,value }: { title: string; value: SalesSummary }) {
  return <Card title={`${title} · ${value.from} to ${value.to}`}>
    <Body>Gross sales: {salesAmount(value.grossSales)}</Body><Body>Discounts: {salesAmount(value.discounts)}</Body>
    <Body>Net sales before refunds: {salesAmount(value.netSales)}</Body><Body>Collected payments: {salesAmount(value.collectedPayments)}</Body>
    <Body>Outstanding on these orders: {salesAmount(value.outstandingPayments)}</Body><Body>Refunds less dated reversals: {salesAmount(value.refundedAmounts)}</Body>
    <Body>{value.orders} orders · {value.productsSold} products sold · {value.cancelledOrders} cancelled orders</Body>
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
      <SalesTotals title="Today" value={report.today}/><SalesTotals title="Selected day" value={report.selectedDay}/>
      <SalesTotals title="Selected month" value={report.selectedMonth}/><SalesTotals title="Selected year" value={report.selectedYear}/>
      <Card title="Daily sales trend"><DataTable columns={["Day","Net sales","Discounts","Orders","Quantity"]} rows={report.dailyTrend.map(point=>({key:point.period,cells:[point.period,salesAmount(point.netSales),salesAmount(point.discounts),point.orders,point.productsSold]}))}/></Card>
      <Card title="Monthly sales trend"><DataTable columns={["Month","Net sales","Discounts","Orders","Quantity"]} rows={report.monthlyTrend.map(point=>({key:point.period,cells:[point.period,salesAmount(point.netSales),salesAmount(point.discounts),point.orders,point.productsSold]}))}/>
        <BarChart label={`Monthly net sales before refunds (${report.currency})`} points={netSalesChartPoints(report.monthlyTrend)} />
        <BarChart label="Monthly order counts" points={report.monthlyTrend.map(point=>({label:point.period,value:point.orders}))}/></Card>
      <Card title="Top products in selected month"><DataTable columns={["Historical product","Quantity","Sales before order discounts"]} rows={report.topProducts.map(point=>({key:`${point.productId}:${point.historicalName}`,cells:[point.historicalName,point.quantity,salesAmount(point.lineSalesBeforeOrderDiscounts)]}))}/></Card>
      <Card title="Export the selected sales period">
        <Choices label="Sales export period" value={exportPeriod} values={exportPeriods} labels={exportLabels} onChange={setExportPeriod} />
        <Body>{report[exportPeriod].from} through {report[exportPeriod].to}. The CSV contains orders created in this period and their transaction history.</Body>
        <AccountingCsvAction key={exportPeriod} report="sales-ledger" fetchCsv={signal => {
          const { from, to } = report[exportPeriod];
          return getSalesApi().exportCsv({ from, to }, { signal });
        }} />
      </Card>
      <Card title="Metric definitions">{Object.entries(report.definitions).map(([key,value])=><Body key={key}>{value}</Body>)}</Card>
    </>}</QueryResult>
  </>;
}
