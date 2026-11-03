import { useState } from "react";
import type { CashbookClose, CashbookDay, CashbookTransaction, CashMovementKind } from "@restaurant-platform/api-client";
import type { AccountingChronology } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { FormToggle, MutationFeedback } from "../../components/forms";
import { Choices } from "../management/controls";
import { useApiQuery } from "../../hooks/useApiQuery";
import { FinancialPagination } from "./FinancialPagination";
import type { FinancialRequestKeys } from "./financial-requests";
import {
  chronologicalLabels, closingVariance, financialAmount, useFinancialAction,
  validFinancialAmount, validFinancialDateRange, validFinancialTimestamp
} from "./expense-cash-form";

const movementKinds = ["OTHER_RECEIPT", "OWNER_DEPOSIT", "OWNER_WITHDRAWAL", "BANK_DEPOSIT", "BANK_WITHDRAWAL", "ADJUSTMENT"] as const;
const movementDirections = { OTHER_RECEIPT: "IN", OWNER_DEPOSIT: "IN", OWNER_WITHDRAWAL: "OUT", BANK_DEPOSIT: "OUT", BANK_WITHDRAWAL: "IN" } as const;
const directionLabels = { IN: "Cash in", OUT: "Cash out" } as const;
const pageSize = 20;

type HistoryFilters = { from?: string; to?: string; sort: AccountingChronology };

export function CashbookScreen({ requestKeys }: { requestKeys: FinancialRequestKeys }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<AccountingChronology>("OLDEST");
  const [filter, setFilter] = useState<HistoryFilters & { search?: string }>({ sort: "OLDEST" });
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [showMovement, setShowMovement] = useState(false);
  const [reversing, setReversing] = useState<CashbookTransaction | null>(null);
  const [reason, setReason] = useState("");
  const query = useApiQuery(signal => getOperationsApi().getCashbookTransactions({ ...filter, page, size: pageSize }, { signal }), JSON.stringify(["cash-transactions", filter, page]));
  const mutation = useFinancialAction(requestKeys);
  function apply() {
    if (!validFinancialDateRange(from, to)) {
      setError("Enter a chronological date range of up to 366 days.");
      return;
    }
    setError("");
    setPage(0);
    setReversing(null);
    setFilter({ from: from || undefined, to: to || undefined, search: search.trim() || undefined, sort });
    query.reload();
  }
  function reverse() {
    if (!reversing) return;
    const body = { reason: reason.trim() };
    void mutation.post(`cash.movement.reverse:${reversing.id}`, body,
      key => getOperationsApi().reverseCashMovement(reversing.id, body.reason, key), () => {
        setReversing(null);
        query.reload();
      });
  }
  return <Page title="Cashbook" subtitle="Physical cash transactions, including amounts held by delivery drivers. Digital payments and unpaid orders are excluded." onRefresh={query.reload}>
    <Action title={showMovement ? "Close cash movement form" : "Record a cash movement"} secondary={showMovement} onPress={() => setShowMovement(value => !value)} />
    {showMovement ? <CashMovementForm requestKeys={requestKeys} onSaved={query.reload} /> : null}
    <Card title="Search cash transactions">
      <FormField label="From date (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder="Blank for restaurant today" />
      <FormField label="Through date (YYYY-MM-DD)" value={to} onChangeText={setTo} error={error || undefined} />
      <FormField label="Search source, description or record ID" value={search} onChangeText={setSearch} maxLength={200} returnKeyType="search" onSubmitEditing={apply} />
      <Choices label="Sort by transaction time" value={sort} values={["OLDEST", "NEWEST"]} labels={chronologicalLabels} onChange={setSort} />
      <Action title="Load cash transactions" onPress={apply} />
    </Card>
    <MutationFeedback {...mutation} />
    {reversing ? <Card title="Reverse a physical cash movement">
      <Body>Source {reversing.sourceId}. Confirm that the opposite movement of {financialAmount(reversing.signedAmount.startsWith("-") ? reversing.signedAmount.slice(1) : reversing.signedAmount)} occurred.</Body>
      <FormField label="Reason for this cash reversal" value={reason} onChangeText={setReason} maxLength={2000} multiline />
      <Action title="Post opposite cash movement now" disabled={mutation.busy || !reason.trim()} onPress={reverse} />
      <Action title="Dismiss reversal" secondary disabled={mutation.busy} onPress={() => setReversing(null)} />
    </Card> : null}
    <QueryResult {...query}>{data => <>
      {!data.items.length ? <Card title="No matching cash transactions"><Body>Choose another date range or search term.</Body></Card> : null}
      {data.items.map(item => <Card key={`${item.source}:${item.id}`} title={`${item.source.replaceAll("_", " ")} · ${financialAmount(item.signedAmount)}`}>
        <Body>{item.occurredAt} · {item.description}</Body>
        <Body>Source record {item.sourceId}</Body>
        <Body>Recorded by {item.recordedBy ?? "Historical cashier unavailable"}</Body>
        {movementKinds.includes(item.source as CashMovementKind) ? <Action title="Review movement reversal" secondary disabled={mutation.busy}
          onPress={() => { setReason(""); setReversing(item); }} /> : null}
      </Card>)}
      <Body>{data.total} cash transactions</Body>
      <FinancialPagination page={page} totalPages={Math.ceil(data.total / data.size)} onPageChange={setPage} />
    </>}</QueryResult>
  </Page>;
}

function CashMovementForm({ requestKeys, onSaved }: { requestKeys: FinancialRequestKeys; onSaved(): void }) {
  const [kind, setKind] = useState<CashMovementKind>("OTHER_RECEIPT");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"IN" | "OUT">("IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());
  const mutation = useFinancialAction(requestKeys);
  const direction = kind === "ADJUSTMENT" ? adjustmentDirection : movementDirections[kind];
  function post() {
    const body = { kind, direction, amount, occurredAt, reason: reason.trim() };
    void mutation.post("cash.movement", body, key => getOperationsApi().createCashMovement(body, key), () => {
      requestKeys.complete("cash.movement", body);
      setAmount("");
      setReason("");
      setOccurredAt(new Date().toISOString());
      onSaved();
    });
  }
  return <Card title="Record a physical cash movement">
    <Body>Record an additional cash event, such as a deposit or withdrawal. Sales, purchases and expenses appear here through their payment records.</Body>
    <Choices label="Movement type" value={kind} values={movementKinds} onChange={setKind} />
    {kind === "ADJUSTMENT" ? <Choices label="Cash direction" value={direction} values={["IN", "OUT"]} labels={directionLabels} onChange={setAdjustmentDirection} /> :
      <Body>{directionLabels[direction]}</Body>}
    <FormField label="Movement amount" value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={19} />
    <FormField label="Actual movement timestamp (ISO 8601 with offset)" value={occurredAt} onChangeText={setOccurredAt} autoCapitalize="none" />
    <FormField label="Reason for this movement" value={reason} onChangeText={setReason} maxLength={2000} multiline />
    <MutationFeedback {...mutation} />
    <Action title="Post cash movement" disabled={mutation.busy || !validFinancialAmount(amount) || !validFinancialTimestamp(occurredAt) || !reason.trim()} onPress={post} />
  </Card>;
}

export function DailyCashClosingScreen({ requestKeys }: { requestKeys: FinancialRequestKeys }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<AccountingChronology>("NEWEST");
  const [filter, setFilter] = useState<HistoryFilters>({ sort: "NEWEST" });
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const day = useApiQuery(signal => getOperationsApi().getCashbookDay(filter.from, { signal }), `cash-day:${filter.from ?? "today"}`);
  const closings = useApiQuery(signal => getOperationsApi().getCashbookClosings({ ...filter, page, size: pageSize }, { signal }), JSON.stringify(["cash-closings", filter, page]));
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const mutation = useFinancialAction(requestKeys);
  function reload() { day.reload(); closings.reload(); }
  function apply() {
    if (!validFinancialDateRange(from, to) || Boolean(to && !from)) {
      setError("Enter the closing day and an optional chronological history range of up to 366 days.");
      return;
    }
    setError("");
    setPage(0);
    setReversing(null);
    setFilter({ from: from || undefined, to: to || undefined, sort });
    reload();
  }
  function reverse() {
    if (!reversing) return;
    const body = { reason: reason.trim() };
    void mutation.post(`cash.closing.reverse:${reversing}`, body,
      key => getOperationsApi().reverseCashClosing(reversing, body.reason, key), () => {
        setReversing(null);
        reload();
      });
  }
  return <Page title="Daily cash closing" subtitle="Reconcile the restaurant’s physical cash in its local business day." onRefresh={reload}>
    <Card title="Select closing day and history">
      <FormField label="Closing day / history from (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder="Blank for restaurant today" />
      <FormField label="History through (YYYY-MM-DD, optional)" value={to} onChangeText={setTo} error={error || undefined} />
      <Choices label="Sort closing history by date" value={sort} values={["NEWEST", "OLDEST"]} labels={chronologicalLabels} onChange={setSort} />
      <Action title="Load cash closing" onPress={apply} />
    </Card>
    <QueryResult {...day}>{data => <DailyCashCount key={data.date} day={data} requestKeys={requestKeys} onSaved={reload} />}</QueryResult>
    <MutationFeedback {...mutation} />
    {reversing ? <Card title="Reverse a finalized count">
      <Body>Closing record {reversing}. Reverse finalized days in newest-first order. This correction reopens the count without moving cash.</Body>
      <FormField label="Reason for reversing this count" value={reason} onChangeText={setReason} maxLength={2000} multiline />
      <Action title="Confirm closing reversal" disabled={mutation.busy || !reason.trim()} onPress={reverse} />
      <Action title="Dismiss reversal" secondary disabled={mutation.busy} onPress={() => setReversing(null)} />
    </Card> : null}
    <Card title="Closing history">
      <QueryResult {...closings}>{data => <>
        {!data.items.length ? <Body>No finalized counts in this date range.</Body> : null}
        {data.items.map(item => <Card key={item.id} title={`${item.date} · Revision ${item.revision}`}>
          <Body>Expected {financialAmount(item.expectedCash)} · Counted {financialAmount(item.actualCash)} · Variance {financialAmount(item.variance)}</Body>
          <Body>Closed {item.closedAt} by {item.responsibleMember}</Body>
          <Body>Closing record {item.id}</Body>
          {item.reconciliationNote ? <Body>Reconciliation note {item.reconciliationNote}</Body> : null}
          {item.reversedAt ? <Body>Reversed {item.reversedAt} by {item.reversedBy}. Reason {item.reversalReason}</Body> :
            <Action title="Review closing reversal" secondary disabled={mutation.busy} onPress={() => { setReason(""); setReversing(item.id); }} />}
        </Card>)}
        <Body>{data.total} closing records</Body>
        <FinancialPagination page={page} totalPages={Math.ceil(data.total / data.size)} onPageChange={setPage} />
      </>}</QueryResult>
    </Card>
  </Page>;
}

function DailyCashCount({ day, requestKeys, onSaved }: { day: CashbookDay; requestKeys: FinancialRequestKeys; onSaved(): void }) {
  const [opening, setOpening] = useState("");
  const [openingReason, setOpeningReason] = useState("");
  const [count, setCount] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<CashbookClose | null>(null);
  const mutation = useFinancialAction(requestKeys);
  const needsReconciliation = day.missingInputs.length > 0;
  const expected = day.expectedClosingCash;
  const variance = expected === null ? null : closingVariance(expected, count);
  function open() {
    const body = { date: day.date, amount: opening, reason: openingReason.trim() };
    void mutation.post("cash.open", body, key => getOperationsApi().openCashbook(body, key), onSaved);
  }
  function prepareClose() {
    if (expected === null || variance === null) return;
    setReview({ date: day.date, actualCash: count, expectedCash: expected, acknowledgeMissingInputs: acknowledged, reconciliationReason: reason.trim() || undefined });
  }
  function close() {
    if (!review) return;
    setReview(null);
    void mutation.post("cash.close", review, key => getOperationsApi().closeCashbook(review, key), onSaved);
  }
  return <>
    <Card title={`${day.date} · ${day.timezone}`}>
      <Body>Opening cash {day.openingBalance === null ? "Count required" : financialAmount(day.openingBalance)}</Body>
      <Body>Cash sales received {financialAmount(day.cashSalesReceived)}</Body>
      <Body>Cash refunds paid {financialAmount(day.cashRefundsPaid)}</Body>
      <Body>Cash purchase payments {financialAmount(day.cashPurchasePayments)}</Body>
      <Body>Cash expense payments {financialAmount(day.cashExpensePayments)}</Body>
      <Body>Other cash receipts {financialAmount(day.otherReceipts)} · Other cash payments {financialAmount(day.otherPayments)}</Body>
      <Body>Expected closing cash {expected === null ? "Opening count required" : financialAmount(expected)}</Body>
      {day.closing ? <>
        <Body>Finalized count {financialAmount(day.closing.actualCash)} · Variance {financialAmount(day.closing.variance)}</Body>
        <Body>Closed {day.closing.closedAt} by {day.closing.responsibleMember}</Body>
      </> : null}
    </Card>
    {needsReconciliation ? <Card title="Historical cash inputs to reconcile">
      {day.missingInputs.map(input => <Body key={input}>{input}</Body>)}
    </Card> : null}
    <MutationFeedback {...mutation} />
    {day.openingBalance === null ? <Card title="Cash opening required">
      <Body>Record an initial opening when starting this cashbook. For an existing cashbook, finalize earlier missing days in sequence.</Body>
      <FormField label="Initial counted opening amount" value={opening} onChangeText={setOpening} keyboardType="number-pad" maxLength={19} />
      <FormField label="Reason for initial opening" value={openingReason} onChangeText={setOpeningReason} maxLength={2000} multiline />
      <Action title="Record initial opening" disabled={mutation.busy || !validFinancialAmount(opening, true) || !openingReason.trim()} onPress={open} />
    </Card> : null}
    {expected !== null && !day.closing ? <Card title="Count and review physical cash">
      <Body>Count all cash held for the restaurant, including driver-held cash. Verify recorded receipts and payouts before closing.</Body>
      <FormField label="Actual counted closing cash" value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={19}
        error={count && variance === null ? "Enter a whole-currency count within the supported variance range." : undefined} />
      {variance === null ? null : <Body>Preview variance {financialAmount(variance)}</Body>}
      {needsReconciliation ? <>
        <FormToggle label="I have reconciled the historical cash inputs" value={acknowledged} onChange={setAcknowledged} />
        <FormField label="How were the historical inputs reconciled?" value={reason} onChangeText={setReason} maxLength={2000} multiline />
      </> : null}
      <Action title="Review closing count" disabled={mutation.busy || variance === null || needsReconciliation && (!acknowledged || !reason.trim())} onPress={prepareClose} />
    </Card> : null}
    <ConfirmDialog visible={review !== null} title="Finalize the cash count"
      message={review ? `${review.date}. Expected ${financialAmount(review.expectedCash ?? "")}. Counted ${financialAmount(review.actualCash)}. Variance ${financialAmount(closingVariance(review.expectedCash ?? "", review.actualCash) ?? "")}.` : ""}
      confirmLabel="Finalize counted cash" onCancel={() => setReview(null)} onConfirm={close} />
  </>;
}
