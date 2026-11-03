import { useState } from "react";
import type { ProcurementPaymentMethod, PurchaseDetail, PurchaseFilters, PurchasePaymentStatus, PurchaseSort } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { MutationFeedback } from "../../components/forms";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { AccountingCsvAction } from "./AccountingCsvAction";
import { FinancialPagination } from "./FinancialPagination";
import { FinancialPeriodFields } from "./FinancialPeriodFields";
import { emptyFinancialPeriod, resolveFinancialPeriod } from "./financial-period";
import type { FinancialRequestKeys } from "./financial-requests";
import { procurementMoney as money, purchaseTimestamp, purchaseWholeAmount } from "./procurement-format";
import { SupplierPicker, type SupplierSelection } from "./SupplierScreens";

const purchaseSortLabels = { NEWEST: "Newest first", OLDEST: "Oldest first", TOTAL_DESC: "Highest total first" } as const;
const statusLabels = { ALL: "All", UNPAID: "Unpaid", PARTIALLY_PAID: "Partially paid", PAID: "Paid" } as const;

export function PurchaseHistory({ today, requests, onReplace }: {
  today: string;
  requests: FinancialRequestKeys;
  onReplace(detail: PurchaseDetail): void;
}) {
  const [period, setPeriod] = useState(() => ({ ...emptyFinancialPeriod, day: today, month: today.slice(0, 7),
    year: today.slice(0, 4), from: today, to: today }));
  const [item, setItem] = useState("");
  const [supplier, setSupplier] = useState<SupplierSelection | null>(null);
  const [status, setStatus] = useState<PurchasePaymentStatus | "ALL">("ALL");
  const [sort, setSort] = useState<PurchaseSort>("NEWEST");
  const [filter, setFilter] = useState<PurchaseFilters>({ from: today, to: today });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useApiQuery(signal => getOperationsApi().listPurchases({ ...filter, sort, page, size: 20 }, { signal }),
    JSON.stringify(["purchases", filter, sort, page]));
  const report = useApiQuery(signal => getOperationsApi().getPurchaseReport(filter, { signal }),
    JSON.stringify(["purchase-report", filter]));

  function apply() {
    try {
      setFilter({ ...resolveFinancialPeriod(period), item: item.trim() || undefined,
        supplierId: supplier?.id, paymentStatus: status === "ALL" ? undefined : status });
      setPage(0);
      setError(null);
      query.reload();
      report.reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check the purchase history filters.");
    }
  }

  if (selected) return <PurchaseDetailScreen id={selected} requests={requests} onBack={() => setSelected(null)}
    onChanged={() => { query.reload(); report.reload(); }} onSelectPurchase={setSelected} onReplace={onReplace} />;

  return <>
    <Card title="Purchase history filters">
      <FinancialPeriodFields value={period} onChange={setPeriod} />
      <FormField label="Search historical item names" value={item} onChangeText={setItem} maxLength={150} returnKeyType="search" onSubmitEditing={apply} />
      <Choices label="Payment status" value={status} values={["ALL", "UNPAID", "PARTIALLY_PAID", "PAID"]} labels={statusLabels} onChange={setStatus} />
      <SupplierPicker value={supplier} onChange={setSupplier} emptyLabel="All suppliers" />
      <MutationFeedback busy={false} error={error} message={null} />
      <Action title="Apply purchase filters" onPress={apply} />
    </Card>
    <Card title="Purchase report">
      <QueryResult {...report}>{result => <>
        <Body>{result.from} through {result.to}</Body>
        <Body>Confirmed purchases {money(result.confirmedTotal)} across {result.purchaseCount} purchases</Body>
        <Body>Cancelled purchases {money(result.cancelledTotal)}</Body>
        {result.monthlyTotals.map(month => <Body key={month.month}>{month.month.slice(0, 7)} · {money(month.confirmedTotal)} across {month.purchaseCount} purchases</Body>)}
        <Body>Purchase totals reflect recorded obligations.</Body>
        <AccountingCsvAction report="purchase-history" title="Export applied purchase filters as CSV"
          fetchCsv={signal => getOperationsApi().getPurchaseCsv({ ...filter, from: result.from, to: result.to }, { signal })} />
      </>}</QueryResult>
    </Card>
    <Card title="Historical purchases">
      <Choices label="Sort purchases" value={sort} values={["NEWEST", "OLDEST", "TOTAL_DESC"]} labels={purchaseSortLabels}
        onChange={value => { setSort(value); setPage(0); }} />
      <QueryResult {...query}>{result => <>
        {result.content.length ? null : <Body>No purchases match the applied filters.</Body>}
        {result.content.map(purchase => <Card key={purchase.id} title={`${purchase.purchaseDate} · ${purchase.supplierName ?? "Supplier unspecified"}`}>
          <Body>{money(purchase.totalAmount)} · {purchase.status === "CANCELLED" ? "Cancelled" : "Confirmed"} · {statusLabels[purchase.paymentStatus]}</Body>
          <Body>Purchased at {purchase.purchasedAt}</Body>
          <Body>Paid {money(purchase.amountPaid)} · Outstanding {money(purchase.outstandingAmount)}</Body>
          <Action title={`View purchase ${purchase.invoiceReference ?? purchase.id}`} secondary onPress={() => setSelected(purchase.id)} />
        </Card>)}
        <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setPage} />
      </>}</QueryResult>
    </Card>
  </>;
}

export function PurchaseDetailScreen({ id, requests, onBack, onChanged, onSelectPurchase, onReplace }: {
  id: string;
  requests: FinancialRequestKeys;
  onBack(): void;
  onChanged(): void;
  onSelectPurchase(id: string): void;
  onReplace(detail: PurchaseDetail): void;
}) {
  const query = useApiQuery(signal => getOperationsApi().getPurchase(id, { signal }), `purchase-detail:${id}`);
  return <Card title="Purchase detail">
    <Action title="Back to purchases" secondary onPress={onBack} />
    <QueryResult {...query}>{detail => <PurchaseDetailContent key={id} detail={detail} requests={requests}
      onChanged={() => { query.reload(); onChanged(); }} onSelectPurchase={onSelectPurchase} onReplace={() => onReplace(detail)} />}</QueryResult>
  </Card>;
}

function PurchaseDetailContent({ detail, requests, onChanged, onSelectPurchase, onReplace }: {
  detail: PurchaseDetail;
  requests: FinancialRequestKeys;
  onChanged(): void;
  onSelectPurchase(id: string): void;
  onReplace(): void;
}) {
  const { purchase } = detail;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ProcurementPaymentMethod>("CASH");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ kind: "CANCEL" } | { kind: "REVERSE"; paymentId: string } | null>(null);
  const [pending, setPending] = useState<{ title: string; message: string; operation: string; body: unknown;
    action(key: string): Promise<PurchaseDetail> } | null>(null);
  const mutation = useApiMutation();

  function preparePayment() {
    setError(null);
    try {
      const body = { amount: purchaseWholeAmount(amount.trim(), true), method, paidAt: purchaseTimestamp(paidAt) };
      if (BigInt(body.amount) > BigInt(purchase.outstandingAmount)) throw new Error("The payment exceeds the outstanding purchase balance.");
      if (Date.parse(body.paidAt) > Date.now()) throw new Error("The payment timestamp must be at or before the current time.");
      setPending({ title: "Record purchase payment", message: `Record ${money(body.amount)} by ${method} at ${body.paidAt}.`,
        operation: `purchase-pay:${purchase.id}`, body, action: key => getOperationsApi().recordPurchasePayment(purchase.id, body, key) });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check the payment fields.");
    }
  }

  function prepareCorrection() {
    if (!correction || !reason.trim()) { setError("Enter a reason for this correction."); return; }
    setError(null);
    const explanation = reason.trim();
    const title = correction.kind === "CANCEL" ? "Cancel confirmed purchase" : "Reverse purchase payment";
    setPending({ title, message: `Reason: ${explanation}\nThe original entry remains in purchase history.`,
      operation: correction.kind === "CANCEL" ? `purchase-cancel:${purchase.id}` : `purchase-reverse:${correction.paymentId}`, body: explanation,
      action: key => correction.kind === "CANCEL" ? getOperationsApi().cancelPurchase(purchase.id, explanation, key)
        : getOperationsApi().reversePurchasePayment(purchase.id, correction.paymentId, explanation, key) });
  }

  return <>
    <Body>Purchase reference {purchase.id}</Body>
    <Body>Purchase date {purchase.purchaseDate}</Body>
    <Body>Purchased at {purchase.purchasedAt}</Body>
    <Body>Recorded at {purchase.createdAt} by {purchase.createdBy}</Body>
    <Body>Supplier at purchase {purchase.supplierName ?? "Unspecified"}</Body>
    <Body>Invoice {purchase.invoiceReference ?? "None"} · Due {purchase.dueDate ?? "Unspecified"}</Body>
    <Body>Total {money(purchase.totalAmount)} · Paid {money(purchase.amountPaid)} · Outstanding {money(purchase.outstandingAmount)}</Body>
    <Body>{purchase.status === "CANCELLED" ? "Cancelled" : "Confirmed"} · {statusLabels[purchase.paymentStatus]}</Body>
    {purchase.receiptId ? <Body>Private receipt reference {purchase.receiptId}</Body> : null}
    <Card title="Historical purchase items">
      {detail.lines.length ? null : <Body>No purchase lines recorded.</Body>}
      {detail.lines.map(line => <Card key={line.id} title={line.itemName}>
        <Body>Quantity {line.quantity} {line.unit}</Body>
        <Body>Recorded unit cost {money(line.unitCost)}</Body>
        <Body>Recorded line total {money(line.lineTotal)}</Body>
      </Card>)}
    </Card>
    <Card title="Payment history">
      {detail.payments.length ? null : <Body>No recorded payments.</Body>}
      {detail.payments.map(payment => <Card key={payment.id} title={`${money(payment.amount)} · ${payment.method}`}>
        <Body>Paid at {payment.paidAt}</Body>
        <Body>Recorded at {payment.createdAt} by {payment.createdBy}</Body>
        {payment.reversalId ? <Body>Reversed at {payment.reversedAt} by {payment.reversedBy}. {payment.reversalReason}</Body>
          : <Action title={`Reverse ${money(payment.amount)} payment…`} secondary disabled={mutation.busy}
            onPress={() => { setError(null); setReason(""); setCorrection({ kind: "REVERSE", paymentId: payment.id }); }} />}
      </Card>)}
    </Card>
    {purchase.status === "CONFIRMED" && purchase.outstandingAmount !== "0" ? <Card title="Record a payment">
      <FormField label="Payment amount (whole currency)" value={amount} onChangeText={setAmount} keyboardType="number-pad" editable={!mutation.busy} />
      <Choices label="Payment method" value={method} values={["CASH", "BANK_TRANSFER", "CARD", "OTHER"]}
        labels={{ CASH: "Cash", BANK_TRANSFER: "Bank transfer", CARD: "Card", OTHER: "Other" }} disabled={mutation.busy} onChange={setMethod} />
      <FormField label="Actual payment timestamp (with timezone)" value={paidAt} onChangeText={setPaidAt} autoCapitalize="none" editable={!mutation.busy} />
      <Action title="Use current payment time" secondary disabled={mutation.busy} onPress={() => setPaidAt(new Date().toISOString())} />
      <Action title="Review payment…" disabled={mutation.busy} onPress={preparePayment} />
    </Card> : null}
    <Card title="Corrections and cancellations">
      {purchase.correctionOfId ? <Action title="View original purchase" secondary disabled={mutation.busy}
        onPress={() => { if (purchase.correctionOfId) onSelectPurchase(purchase.correctionOfId); }} /> : null}
      {detail.cancellations.map(adjustment => <Body key={adjustment.id}>Cancelled at {adjustment.createdAt} by {adjustment.createdBy}. {adjustment.reason}</Body>)}
      {detail.corrections.map(id => <Action key={id} title={`View replacement purchase ${id}`} secondary disabled={mutation.busy}
        onPress={() => onSelectPurchase(id)} />)}
      {purchase.status === "CONFIRMED" ? <>
        <Body>Reverse effective payments before cancelling a purchase.</Body>
        <Action title="Cancel purchase…" secondary disabled={mutation.busy || purchase.amountPaid !== "0"}
          onPress={() => { setError(null); setReason(""); setCorrection({ kind: "CANCEL" }); }} />
      </> : detail.corrections.length ? null : <Action title="Start linked replacement purchase" secondary disabled={mutation.busy} onPress={onReplace} />}
      {correction ? <>
        <FormField label={correction.kind === "CANCEL" ? "Cancellation reason" : "Payment reversal reason"}
          value={reason} onChangeText={setReason} maxLength={1000} editable={!mutation.busy} />
        <Action title="Review correction…" disabled={mutation.busy} onPress={prepareCorrection} />
        <Action title="Dismiss correction" secondary disabled={mutation.busy} onPress={() => { setError(null); setCorrection(null); }} />
      </> : null}
    </Card>
    <MutationFeedback {...mutation} error={error ?? mutation.error} />
    <ConfirmDialog visible={pending !== null} title={pending?.title ?? "Confirm purchase change"} message={pending?.message ?? ""}
      confirmLabel="Confirm change" onCancel={() => setPending(null)} onConfirm={() => {
        const request = pending;
        setPending(null);
        if (request) void mutation.run(() => request.action(requests.key(request.operation, request.body)), () => {
          requests.complete(request.operation, request.body);
          onChanged();
        });
      }} />
  </>;
}
