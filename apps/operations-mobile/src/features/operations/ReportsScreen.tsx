import { useState } from "react";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { isIsoDate } from "./format";
import { SalesDashboardPanel } from "../accounting/SalesDashboardPanel";

export function ReportsScreen() {
  const [input, setInput] = useState("");
  const [until, setUntil] = useState("");
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({});
  const [invalid, setInvalid] = useState(false);
  const query = useApiQuery(signal => getOperationsApi().getFinancialReport(period.from, period.to, { signal }), `financial-report:${period.from}:${period.to}`);
  function applyDate() {
    const next = input.trim(), end = until.trim();
    if ((next && !isIsoDate(next)) || (end && !isIsoDate(end)) || (next && end && next > end)) { setInvalid(true); return; }
    setInvalid(false);
    setPeriod({ from: next || undefined, to: end || undefined }); query.reload();
  }
  return <Page title="Financial reports" subtitle="Sales, recorded expenses and payment flow">
    <SalesDashboardPanel />
    <Card><FormField label="From date (YYYY-MM-DD)" placeholder="Blank for restaurant-local today" value={input} onChangeText={setInput}
      autoCapitalize="none" error={invalid ? "Enter a valid date such as 2026-11-02." : undefined} />
      <FormField label="Through date (inclusive)" placeholder="Use month/year start and end for a period report" value={until} onChangeText={setUntil} autoCapitalize="none" />
      <Action title="Load report" onPress={applyDate} /></Card>
    <QueryResult {...query}>{report => <>
      <Card title={`${report.from} – ${report.to} · ${report.timezone}`}>
        <Body>All amounts in whole {report.currency} units.</Body>
        <Body>Gross sales: {report.sales.grossSales}</Body>
        <Body>Discounts: {report.sales.discounts}</Body>
        <Body>Net sales: {report.sales.netSales}</Body>
        <Body>Collected payments: {report.sales.collectedPayments}</Body>
        <Body>Outstanding for these orders: {report.sales.outstandingPayments}</Body>
        <Body>Dated refunds: {report.sales.refundedAmounts}</Body>
        <Body>Orders: {report.sales.orders} · Products sold: {report.sales.productsSold}</Body>
      </Card>
      <Card title="Cash flow and expense summary">
        <Body>Confirmed purchases: {report.confirmedPurchases}</Body>
        <Body>Registered operating expenses: {report.registeredOperatingExpenses}</Body>
        <Body>Purchase payments less reversals: {report.purchasePayments}</Body>
        <Body>Expense payments less reversals: {report.expensePayments}</Body>
        <Body>Trading payment net: {report.tradingPaymentNet}</Body>
        <Body>Profit unavailable: verified inventory consumption and COGS are missing.</Body>
        {report.expensesByCategory.map(category => <Body key={category.category}>{category.category}: {category.amount}</Body>)}
        {report.missingInputs.map(input => <Body key={input}>{input}</Body>)}
      </Card>
    </>}</QueryResult>
  </Page>;
}
