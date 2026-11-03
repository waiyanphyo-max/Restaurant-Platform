import { useState } from "react";
import type { SalesLedgerQuery } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Body, Card } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { AccountingCsvAction } from "./AccountingCsvAction";
import { FinancialPeriodForm } from "./FinancialPeriodFields";
import { emptySalesHistoryFilters, SalesHistoryFilters } from "./SalesHistoryFilters";
import { getSalesApi, salesAmount } from "./salesApi";

function SalesExport() {
  const [draft, setDraft] = useState(emptySalesHistoryFilters);
  const [filters, setFilters] = useState<SalesLedgerQuery>({ sort: "NEWEST" });
  const query = useApiQuery(signal => getSalesApi().getLedger({ ...filters, size: 1 }, { signal }), `sales-export:${JSON.stringify(filters)}`);
  return <>
    <SalesHistoryFilters value={draft} onChange={setDraft} onApply={value => { setFilters(value); query.reload(); }} title="Apply export filters" />
    <Card title="Sales history CSV">
      <QueryResult {...query}>{data => <Body>{data.totalElements ? `${data.totalElements} matching orders across all pages.` : "No orders match the applied filters."}</Body>}</QueryResult>
      <AccountingCsvAction report="sales-ledger" disabled={query.state.status !== "ready"}
        fetchCsv={signal => getSalesApi().exportCsv(filters, { signal })} />
    </Card>
  </>;
}

function PeriodExport({ report }: { report: "purchase-history" | "financial-summary" }) {
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({});
  const { from, to } = period;
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    if (report === "purchase-history") {
      const result = await api.getPurchaseReport(period, { signal });
      return { from: result.from, to: result.to, preview: result.purchaseCount ? `${result.purchaseCount} purchase records in this report.` : "No purchase records in this period." };
    }
    const result = await api.getFinancialReport(from, to, { signal });
    return { from: result.from, to: result.to, preview: `Collected payments ${salesAmount(result.sales.collectedPayments)} ${result.currency}.` };
  }, `${report}-export:${from}:${to}`);
  return <>
    <FinancialPeriodForm onApply={value => { setPeriod(value); query.reload(); }} />
    <Card title={report === "purchase-history" ? "Purchase history CSV" : "Financial summary CSV"}>
      <QueryResult {...query}>{data => <><Body>{data.from} through {data.to}</Body><Body>{data.preview}</Body></>}</QueryResult>
      <AccountingCsvAction report={report} disabled={query.state.status !== "ready"} fetchCsv={signal => {
        const api = getOperationsApi();
        const dateRange = query.state.status === "ready" ? { from: query.state.data.from, to: query.state.data.to } : period;
        return report === "purchase-history" ? api.getPurchaseCsv(dateRange, { signal }) : api.getFinancialReportCsv(dateRange.from, dateRange.to, { signal });
      }} />
    </Card>
  </>;
}

const reportLabels = { SALES: "Sales history", PURCHASES: "Purchase history", SUMMARY: "Financial summary" } as const;

export function ExportReportsScreen() {
  const [view, setView] = useState<keyof typeof reportLabels>("SALES");
  return <>
    <Card title="Export and share reports">
      <Body>Choose a report and apply its filters before sharing the complete CSV with a recipient.</Body>
      <Choices<keyof typeof reportLabels> label="Report type" value={view} values={["SALES", "PURCHASES", "SUMMARY"]} onChange={setView} labels={reportLabels} />
    </Card>
    {view === "SALES" ? <SalesExport /> : <PeriodExport key={view} report={view === "PURCHASES" ? "purchase-history" : "financial-summary"} />}
  </>;
}
