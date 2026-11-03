import { useState } from "react";
import type { SalesLedgerQuery, SalesProductSort } from "@restaurant-platform/shared-types";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, DataTable, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { AccountingCsvAction } from "./AccountingCsvAction";
import { FinancialPagination } from "./FinancialPagination";
import { SalesDetailScreen } from "./SalesDetailScreen";
import { emptySalesHistoryFilters, SalesHistoryFilters } from "./SalesHistoryFilters";
import { FinancialRequestKeys } from "./financial-requests";
import { getSalesApi, salesAmount } from "./salesApi";

export function SalesLedgerScreen() {
  const [draft, setDraft] = useState(emptySalesHistoryFilters);
  const [filters, setFilters] = useState<SalesLedgerQuery>({ sort: "NEWEST" });
  const [page, setPage] = useState(0);
  const [productPage, setProductPage] = useState(0);
  const [productSort, setProductSort] = useState<SalesProductSort>("MOST_SOLD");
  const [selected, setSelected] = useState<string | null>(null);
  const [requestKeys] = useState(() => new FinancialRequestKeys());
  const query = useApiQuery(signal => getSalesApi().getLedger({ ...filters, page, size: 20 }, { signal }), `sales-ledger:${JSON.stringify(filters)}:${page}`);
  const productFilters = { from: filters.from, to: filters.to, search: filters.product, sort: productSort };
  const products = useApiQuery(signal => getSalesApi().getProducts({ ...productFilters, page: productPage, size: 20 }, { signal }),
    `sales-products:${JSON.stringify(productFilters)}:${productPage}`);

  function reload() {
    query.reload();
    products.reload();
  }

  function apply(next: SalesLedgerQuery) {
    setFilters(next);
    setPage(0);
    setProductPage(0);
    reload();
  }

  if (selected) return <SalesDetailScreen id={selected} requestKeys={requestKeys} onBack={() => { setSelected(null); reload(); }} />;

  return <Page title="Detailed sales history" subtitle="Historical orders, item prices, collections and corrections."
    onRefresh={reload} refreshing={query.state.status === "loading" || products.state.status === "loading"}>
    <SalesHistoryFilters value={draft} onChange={setDraft} onApply={apply} />
    <Card title="Sales history export">
      <Body>The CSV includes all orders matching the applied filters across pages.</Body>
      <AccountingCsvAction report="sales-ledger" disabled={query.state.status !== "ready"} fetchCsv={signal => getSalesApi().exportCsv(filters, { signal })} />
    </Card>
    <QueryResult {...query}>{data => <>
      {data.content.map(sale => <Card key={sale.id} title={sale.orderNumber}>
        <Body>{sale.createdAt}</Body>
        <Body>{sale.orderType.replaceAll("_", " ")} · {sale.orderChannel.replaceAll("_", " ")} · {sale.status} · {sale.paymentStatus.replaceAll("_", " ")}</Body>
        <Body>Historical total {salesAmount(sale.totalAmount)} · Discount {salesAmount(sale.discountAmount)}</Body>
        {sale.lines.length ? <Body>{sale.lines.map(line => `${line.productName} × ${line.quantity}`).join(" · ")}</Body> : null}
        <Action title={`View sale ${sale.orderNumber}`} secondary onPress={() => setSelected(sale.id)} />
      </Card>)}
      {data.totalElements === 0 ? <Card title="No sales found"><Body>Adjust the selected dates or search filters.</Body></Card> : <>
        <Body>{data.totalElements} matching orders</Body>
        <FinancialPagination page={data.page} totalPages={Math.ceil(data.totalElements / data.size)} onPageChange={setPage} />
      </>}
    </>}</QueryResult>
    <Card title="Product breakdown for the selected period">
      <Body>Historical item quantities and line sales cover all channels and payment statuses, before order discounts and delivery fees.</Body>
      <Choices label="Product sorting" value={productSort} values={["MOST_SOLD", "HIGHEST_SALES", "NAME"]}
        labels={{ MOST_SOLD: "Most units sold", HIGHEST_SALES: "Highest line sales", NAME: "Product name" }}
        onChange={value => { setProductSort(value); setProductPage(0); }} />
      <QueryResult {...products}>{data => <>
        <DataTable columns={["Historical product", "Quantity", "Historical line sales"]} emptyMessage="No products sold match this period and product search."
          rows={data.content.map(row => ({ key: `${row.productId}:${row.historicalName}`, cells: [row.historicalName, row.quantity, salesAmount(row.lineSalesBeforeOrderDiscounts)] }))} />
        <FinancialPagination page={data.page} totalPages={Math.ceil(data.totalElements / data.size)} onPageChange={setProductPage} />
      </>}</QueryResult>
    </Card>
  </Page>;
}
