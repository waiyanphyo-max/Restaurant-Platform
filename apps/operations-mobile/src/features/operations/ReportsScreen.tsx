import { useState } from "react";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, BarChart, Body, Card, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { isIsoDate, operationalAmount } from "./format";

export function ReportsScreen() {
  const [input, setInput] = useState("");
  const [date, setDate] = useState<string | undefined>();
  const [invalid, setInvalid] = useState(false);
  const query = useApiQuery(signal => getOperationsApi().getDailyReport(date, { signal }), `daily-report:${date ?? "restaurant-today"}`);
  function applyDate() {
    const next = input.trim();
    if (next && !isIsoDate(next)) { setInvalid(true); return; }
    setInvalid(false);
    if ((next || undefined) === date) query.reload();
    else setDate(next || undefined);
  }
  return <Page title="Reports" subtitle="Daily operations report">
    <Card><FormField label="Report date (YYYY-MM-DD)" placeholder="Blank for today in the restaurant timezone" value={input} onChangeText={setInput}
      autoCapitalize="none" error={invalid ? "Enter a valid date such as 2026-11-02." : undefined} />
      <Action title="Load report" onPress={applyDate} /></Card>
    <QueryResult {...query}>{report => <>
      <Card title={`${report.reportDate} · ${report.timezone}`}>
        <Body>Total orders: {report.totalOrders}</Body>
        <Body>Order totals excluding cancelled: {operationalAmount(report.orderAmountExcludingCancelled)}</Body>
        <Body>Collected payments: {operationalAmount(report.paidAmount)}</Body>
        <Body>Order totals use order creation dates. Collected payments use payment dates. These figures can differ and do not establish revenue or profit.</Body>
        <Body>Amounts use the existing operations report units. Currency and accounting reconciliation are not included in this report.</Body>
      </Card>
      <Card><BarChart label="Order status counts" points={[
        { label: "Pending", value: report.pendingOrders }, { label: "Accepted", value: report.acceptedOrders },
        { label: "Preparing", value: report.preparingOrders }, { label: "Ready", value: report.readyOrders },
        { label: "Out for delivery", value: report.outForDeliveryOrders }, { label: "Completed", value: report.completedOrders },
        { label: "Cancelled", value: report.cancelledOrders }
      ]} /></Card>
    </>}</QueryResult>
  </Page>;
}
