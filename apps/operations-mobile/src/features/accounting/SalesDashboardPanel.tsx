import { useState } from "react";
import type { SalesSummary } from "@restaurant-platform/shared-types";
import { QueryResult } from "../../components/QueryResult";
import { Action, BarChart, Body, Card, DataTable, FormField } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { isIsoDate } from "../operations/format";
import { getSalesApi, salesAmount } from "./salesApi";

function Totals({ title,value }: { title: string; value: SalesSummary }) {
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
  const [filters,setFilters]=useState<{date?: string;month?: string;year?: number}>({});
  const [error,setError]=useState("");
  const query=useApiQuery(signal=>getSalesApi().getDashboard(filters,{signal}),`sales-dashboard:${JSON.stringify(filters)}`);
  function apply() {
    if(date&&!isIsoDate(date) || month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || year&&!/^(19\d{2}|[2-9]\d{3})$/.test(year)) { setError("Use a calendar date YYYY-MM-DD, month YYYY-MM, and four-digit year."); return; }
    setError(""); setFilters({date:date||undefined,month:month||undefined,year:year?parseInt(year,10):undefined}); query.reload();
  }
  return <>
    <Card title="Sales dashboard">
      <Body>Leave selectors blank for current restaurant dates. Daily and monthly revenue uses order creation dates; collections and refunds use payment dates.</Body>
      <FormField label="Selected sales day (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" />
      <FormField label="Trend month (YYYY-MM)" value={month} onChangeText={setMonth} autoCapitalize="none" />
      <FormField label="Trend year (YYYY)" value={year} onChangeText={setYear} keyboardType="number-pad" error={error||undefined} />
      <Action title="Load sales dashboard" onPress={apply} />
    </Card>
    <QueryResult {...query}>{report=><>
      <Card><Body>{report.timezone} · All amounts in whole {report.currency} units.</Body></Card>
      <Totals title="Today" value={report.today}/><Totals title="Selected day" value={report.selectedDay}/>
      <Totals title="Selected month" value={report.selectedMonth}/><Totals title="Selected year" value={report.selectedYear}/>
      <Card title="Daily sales trend"><DataTable columns={["Day","Net sales","Discounts","Orders","Quantity"]} rows={report.dailyTrend.map(point=>({key:point.period,cells:[point.period,salesAmount(point.netSales),salesAmount(point.discounts),point.orders,point.productsSold]}))}/></Card>
      <Card title="Monthly sales trend"><DataTable columns={["Month","Net sales","Discounts","Orders","Quantity"]} rows={report.monthlyTrend.map(point=>({key:point.period,cells:[point.period,salesAmount(point.netSales),salesAmount(point.discounts),point.orders,point.productsSold]}))}/>
        <BarChart label="Monthly order counts" points={report.monthlyTrend.map(point=>({label:point.period,value:point.orders}))}/></Card>
      <Card title="Top products in selected month"><DataTable columns={["Historical product","Quantity","Sales before order discounts"]} rows={report.topProducts.map(point=>({key:`${point.productId}:${point.historicalName}`,cells:[point.historicalName,point.quantity,salesAmount(point.lineSalesBeforeOrderDiscounts)]}))}/></Card>
      <Card title="Metric definitions">{Object.entries(report.definitions).map(([key,value])=><Body key={key}>{key}: {value}</Body>)}</Card>
    </>}</QueryResult>
  </>;
}
