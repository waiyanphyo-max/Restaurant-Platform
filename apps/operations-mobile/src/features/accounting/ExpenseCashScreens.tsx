import { useRef, useState } from "react";
import type { CashMovementKind, CashbookDay, ExpenseCategory, ExpensePaymentMethod } from "@restaurant-platform/api-client";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, DataTable, FormField, Page } from "../../components/ui";
import { FormToggle, MutationFeedback } from "../../components/forms";
import { Choices } from "../management/controls";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { isIsoDate } from "../operations/format";
import { FinancialRequestKeys } from "./financial-requests";

const categories: readonly ExpenseCategory[] = ["RENT", "SALARIES_WAGES", "ELECTRICITY", "WATER", "INTERNET", "TRANSPORT", "PACKAGING", "EQUIPMENT_MAINTENANCE", "MARKETING", "MISCELLANEOUS"];
const methods: readonly ExpensePaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"];
const movementKinds: readonly CashMovementKind[] = ["OTHER_RECEIPT", "OWNER_DEPOSIT", "OWNER_WITHDRAWAL", "BANK_DEPOSIT", "BANK_WITHDRAWAL", "ADJUSTMENT"];
export function financialAmount(value: string | null) { return value === null ? "Opening count required" : /^-?\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "Amount unavailable"; }

/** Repeated submits of an unchanged form reuse its key, including after success. */
function useFinancialAction() {
  const mutation = useApiMutation();
  const pending = useRef(new FinancialRequestKeys());
  async function post<T>(operation: string, body: unknown, action: (key: string) => Promise<T>, success?: (value: T) => void) {
    const retainedKey = pending.current.key(operation, body);
    await mutation.run(() => action(retainedKey), value => { success?.(value); });
  }
  return { ...mutation, post };
}

export function ExpenseScreen() {
  const [fromInput, setFrom] = useState(""); const [toInput, setTo] = useState("");
  const [searchInput, setSearch] = useState("");
  const [filter, setFilter] = useState<{ from?: string; to?: string; search?: string }>({});
  const [page, setPage] = useState(0); const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"REGISTER" | "RECORD" | "TEMPLATES">("REGISTER");
  const [category, setCategory] = useState<ExpenseCategory>("RENT"); const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(""); const [description, setDescription] = useState("");
  const [payee, setPayee] = useState(""); const [receiptId, setReceipt] = useState("");
  const [frequency, setFrequency] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [reason, setReason] = useState("");
  const [reportPeriod, setPeriod] = useState<"DAY" | "MONTH" | "YEAR">("DAY");
  const query = useApiQuery(signal => getOperationsApi().listExpenses({ ...filter, page, size: 20 }, { signal }), `expenses:${JSON.stringify(filter)}:${page}`);
  const report = useApiQuery(signal => getOperationsApi().getExpenseReport({ ...filter, period: reportPeriod }, { signal }), `expense-report:${JSON.stringify(filter)}:${reportPeriod}`);
  const templates = useApiQuery(signal => getOperationsApi().listExpenseTemplates({ signal }), "expense-templates");
  const mutation = useFinancialAction();
  function reload() { query.reload(); report.reload(); templates.reload(); }
  function apply() {
    if (fromInput && !isIsoDate(fromInput) || toInput && !isIsoDate(toInput) || fromInput && toInput && toInput < fromInput) { setInvalid(true); return; }
    setInvalid(false);setPage(0);setFilter({ from: fromInput || undefined, to: toInput || undefined, search: searchInput || undefined });
  }
  const createBody = { category, amount, expenseDate, description, payee: payee || null, receiptId: receiptId || null };
  const templateBody = { category, amount, description, payee: payee || null, frequency, startsOn: expenseDate };
  return <Page title="Operating expenses" subtitle="Recorded obligations and separate payment history. Whole-currency amounts." onRefresh={reload}>
    <Choices<"REGISTER" | "RECORD" | "TEMPLATES"> label="Expense workspace" value={mode} values={["REGISTER", "RECORD", "TEMPLATES"] as const} onChange={setMode} />
    <MutationFeedback {...mutation} />
    {mode === "REGISTER" ? <>
      <Card title="Find historical expenses">
        <FormField label="From date (YYYY-MM-DD)" value={fromInput} onChangeText={setFrom} placeholder="Blank for restaurant today" />
        <FormField label="Through date (inclusive)" value={toInput} onChangeText={setTo} placeholder="Use the same date for one day" />
        <FormField label="Search descriptions or payees" value={searchInput} onChangeText={setSearch} />
        {invalid ? <Body>Enter a valid chronological date range.</Body> : null}
        <Action title="Load expenses" onPress={apply} />
      </Card>
      <QueryResult {...query}>{data => <>
        {data.items.map(expense => <Card key={expense.id} title={`${expense.expenseDate} · ${expense.category.replaceAll("_", " ")}`}>
          <Body>{expense.description} · {expense.payee ?? "No payee"}</Body>
          <Body>Amount {financialAmount(expense.amount)} · Paid {financialAmount(expense.paidAmount)} · Outstanding {financialAmount(expense.outstandingAmount)}</Body>
          <Body>{expense.paymentStatus} · Recorded by {expense.recordedBy} at {expense.createdAt}</Body>
          {expense.cancelledAt ? <Body>Cancelled {expense.cancelledAt}: {expense.cancellationReason}</Body> : null}
          <Action title="View payments and corrections" secondary onPress={() => setSelected(expense.id)} />
        </Card>)}
        {!data.items.length ? <Card><Body>No expenses for this period.</Body></Card> : null}
        <Body>{data.total} records · Page {page + 1}</Body>
        <Action title="Previous expenses" secondary disabled={page === 0} onPress={() => setPage(v => v - 1)} />
        <Action title="Next expenses" secondary disabled={(page + 1) * data.size >= data.total} onPress={() => setPage(v => v + 1)} />
      </>}</QueryResult>
      {selected ? <ExpenseDetails expenseId={selected} onSaved={reload} onDismiss={() => setSelected(null)} /> : null}
      <Card title="Expense report">
        <Choices<"DAY" | "MONTH" | "YEAR"> label="Group expense dates by" value={reportPeriod} values={["DAY", "MONTH", "YEAR"] as const} onChange={setPeriod} />
        <QueryResult {...report}>{data => <><Body>{data.from} through {data.to}. Cancelled amounts remain visible. Search above applies to register records; report includes every expense in the selected date range.</Body>
          <DataTable columns={["Period", "Category", "Posted", "Cancelled", "Net expense"]} rows={data.totals.map(row => ({ key: `${row.periodStart}:${row.category}`, cells: [row.periodStart, row.category, financialAmount(row.postedAmount), financialAmount(row.cancelledAmount), financialAmount(row.expenseAmount)] }))} /></>}</QueryResult>
      </Card>
    </> : null}
    {mode === "RECORD" || mode === "TEMPLATES" ? <Card title={mode === "RECORD" ? "Record an expense obligation" : "Create a recurring template"}>
      <Body>Record inventory purchases in the purchase register. Check that this obligation has not already been recorded there.</Body>
      <Choices<ExpenseCategory> label="Expense category" value={category} values={categories} onChange={setCategory} />
      <FormField label="Whole-currency amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <FormField label={mode === "RECORD" ? "Expense date (YYYY-MM-DD)" : "First occurrence date (YYYY-MM-DD)"} value={expenseDate} onChangeText={setExpenseDate} />
      <FormField label="Description" value={description} onChangeText={setDescription} />
      <FormField label="Payee (optional)" value={payee} onChangeText={setPayee} />
      {mode === "RECORD" ? <><FormField label="Private receipt ID (optional)" value={receiptId} onChangeText={setReceipt} autoCapitalize="none" />
        <Body>Posting records an unpaid obligation. Record payment separately when paid.</Body>
        <Action title="Post expense" disabled={mutation.busy} onPress={() => { void mutation.post("expense.create", createBody, key => getOperationsApi().createExpense(createBody, key), item => { setSelected(item.id);setMode("REGISTER");reload(); }); }} />
      </> : <><Choices<"MONTHLY" | "YEARLY"> label="Recurrence" value={frequency} values={["MONTHLY", "YEARLY"] as const} onChange={setFrequency} />
        <Body>Templates require explicit confirmation for each due date. Saving this template posts no expense.</Body>
        <Action title="Save recurring template" disabled={mutation.busy} onPress={() => { void mutation.post("expense.template", templateBody, key => getOperationsApi().createExpenseTemplate(templateBody, key), () => { reload(); }); }} />
      </>}
    </Card> : null}
    {mode === "TEMPLATES" ? <Card title="Recurring templates">
      <FormField label="Date to explicitly confirm (YYYY-MM-DD)" value={expenseDate} onChangeText={setExpenseDate} />
      <FormField label="Reason to stop a template" value={reason} onChangeText={setReason} />
      <QueryResult {...templates}>{items => <>{items.map(template => <Card key={template.id} title={template.description}>
        <Body>{template.category} · {financialAmount(template.amount)} · {template.frequency} from {template.startsOn} · {template.active ? "Active" : "Stopped"}</Body>
        <Action title="Confirm and post selected occurrence" disabled={!template.active || mutation.busy || !isIsoDate(expenseDate)} onPress={() => { void mutation.post(`template.confirm:${template.id}`, { expenseDate }, key => getOperationsApi().confirmExpenseTemplate(template.id, expenseDate, key), () => reload()); }} />
        <Action title="Stop template" secondary disabled={!template.active || mutation.busy || !reason.trim()} onPress={() => { void mutation.post(`template.stop:${template.id}`, { reason }, key => getOperationsApi().stopExpenseTemplate(template.id, reason, key), () => reload()); }} />
      </Card>)}</>}</QueryResult>
    </Card> : null}
  </Page>;
}

function ExpenseDetails({ expenseId, onSaved, onDismiss }: { expenseId: string; onSaved(): void; onDismiss(): void }) {
  const query = useApiQuery(signal => getOperationsApi().getExpense(expenseId, { signal }), `expense-detail:${expenseId}`);
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState<ExpensePaymentMethod>("CASH");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString());const [reason, setReason] = useState("");
  const mutation = useFinancialAction();const reload = () => { query.reload(); onSaved(); };
  const body = { amount, method, paidAt };
  return <Card title="Expense detail and audit history">
    <Action title="Close expense detail" secondary onPress={onDismiss} /><MutationFeedback {...mutation} />
    <QueryResult {...query}>{data => <>
      <Body>{data.expense.id} · {data.expense.description}</Body>
      <Body>Historical amount {financialAmount(data.expense.amount)} · {data.expense.paymentStatus}</Body>
      <Body>Expense date {data.expense.expenseDate}; recorded {data.expense.createdAt} by {data.expense.recordedBy}</Body>
      {data.expense.receiptId ? <Body>Private receipt: {data.expense.receiptId}</Body> : null}
      <FormField label="Payment amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Choices<ExpensePaymentMethod> label="Payment method" value={method} values={methods} onChange={setMethod} />
      <FormField label="Exact payment timestamp with offset" value={paidAt} onChangeText={setPaidAt} autoCapitalize="none" />
      <Action title="Record actual payment" disabled={mutation.busy || !amount || data.expense.paymentStatus === "CANCELLED" || data.expense.outstandingAmount === "0"} onPress={() => { void mutation.post(`expense.pay:${expenseId}`, body, key => getOperationsApi().payExpense(expenseId, body, key), () => {setAmount("");setPaidAt(new Date().toISOString());reload();}); }} />
      <FormField label="Correction or cancellation reason" value={reason} onChangeText={setReason} />
      {data.payments.map(payment => <Card key={payment.id} title={`${payment.method} · ${financialAmount(payment.amount)}`}>
        <Body>Paid {payment.paidAt}; recorded by {payment.recordedBy} at {payment.createdAt}</Body>
        {payment.reversedAt ? <Body>Reversed {payment.reversedAt} by {payment.reversedBy}: {payment.reversalReason}</Body> : <>
          <Body>A reversal records returned funds now and restores the unpaid balance.</Body>
          <Action title="Record returned funds and reverse payment" secondary disabled={mutation.busy || !reason.trim()} onPress={() => { void mutation.post(`expense.payment.reverse:${payment.id}`, { reason }, key => getOperationsApi().reverseExpensePayment(expenseId, payment.id, reason, key), reload); }} />
        </>}
      </Card>)}
      {data.expense.cancelledAt ? <Body>Cancelled {data.expense.cancelledAt} by {data.expense.cancelledBy}: {data.expense.cancellationReason}</Body> :
        <Action title="Cancel expense after reversing payments" secondary disabled={mutation.busy || !reason.trim() || data.expense.paidAmount !== "0"} onPress={() => { void mutation.post(`expense.cancel:${expenseId}`, { reason }, key => getOperationsApi().cancelExpense(expenseId, reason, key), reload); }} />}
    </>}</QueryResult>
  </Card>;
}

export function CashbookScreen() {
  const [dateInput, setDate] = useState("");const [date, setAppliedDate] = useState<string | undefined>();
  const [toInput, setTo] = useState("");const [to, setAppliedTo] = useState<string | undefined>();
  const [page, setPage] = useState(0);const [closingPage, setClosingPage] = useState(0);const [invalid, setInvalid] = useState(false);
  const [amount, setAmount] = useState("");const [reason, setReason] = useState("");
  const [kind, setKind] = useState<CashMovementKind>("OTHER_RECEIPT");const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());const [count, setCount] = useState("");
  const [confirm, setConfirm] = useState<CashbookDay | null>(null);const [acknowledge, setAcknowledge] = useState(false);
  const query = useApiQuery(signal => getOperationsApi().getCashbookDay(date, { signal }), `cash-day:${date ?? "today"}`);
  const transactions = useApiQuery(signal => getOperationsApi().getCashbookTransactions({ from: date, to: to ?? date, page, size: 20 }, { signal }), `cash-tx:${date}:${to}:${page}`);
  const closings = useApiQuery(signal => getOperationsApi().getCashbookClosings({ from: date, to: to ?? date, page: closingPage, size: 20 }, { signal }), `cash-closings:${date}:${to}:${closingPage}`);
  const mutation = useFinancialAction();const reload = () => { query.reload();transactions.reload();closings.reload(); };
  function apply() {
    if (dateInput && !isIsoDate(dateInput) || toInput && !isIsoDate(toInput) || dateInput && toInput && toInput < dateInput) { setInvalid(true);return; }
    setInvalid(false);setAppliedDate(dateInput || undefined);setAppliedTo(toInput || undefined);setPage(0);setClosingPage(0);
  }
  const movement = { kind, direction, amount, occurredAt, reason };
  return <Page title="Cashbook and daily closing" subtitle="Restaurant-local physical cash, with immutable counts and corrections." onRefresh={reload}>
    <Card title="Choose historical dates">
      <FormField label="Cashbook day / history from (YYYY-MM-DD)" value={dateInput} onChangeText={setDate} placeholder="Blank for restaurant today" />
      <FormField label="History through (optional)" value={toInput} onChangeText={setTo} />
      {invalid ? <Body>Enter a valid chronological date range.</Body> : null}<Action title="Load cashbook" onPress={apply} />
    </Card>
    <MutationFeedback {...mutation} />
    <QueryResult {...query}>{day => <>
      <Card title={`${day.date} · ${day.timezone}`}>
        <Body>Opening cash: {financialAmount(day.openingBalance)}</Body>
        <Body>Cash sales received: {financialAmount(day.cashSalesReceived)}</Body>
        <Body>Cash refunds paid: {financialAmount(day.cashRefundsPaid)}</Body>
        <Body>Cash purchase payments: {financialAmount(day.cashPurchasePayments)}</Body>
        <Body>Cash expense payments: {financialAmount(day.cashExpensePayments)}</Body>
        <Body>Other cash receipts: {financialAmount(day.otherReceipts)} · Other cash payments: {financialAmount(day.otherPayments)}</Body>
        <Body>Expected closing cash: {financialAmount(day.expectedClosingCash)}</Body>
        <Body>This is consolidated restaurant cash, including cash collected by delivery drivers. Count all cash held for the restaurant, including driver custody. Record bank deposits and withdrawals explicitly. Digital payments and unpaid orders are excluded.</Body>
        {(day.missingInputs ?? []).map(input => <Body key={input}>{input}</Body>)}
        {day.closing ? <><Body>Finalized count: {financialAmount(day.closing.actualCash)} · Variance: {financialAmount(day.closing.variance)}</Body><Body>Closed {day.closing.closedAt} by {day.closing.responsibleMember}</Body></> : null}
      </Card>
      <Card title="Initialize or count cash">
        <FormField label="Initial cash amount / movement amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <FormField label="Reason for opening, movement or reversal" value={reason} onChangeText={setReason} />
        {day.openingBalance === null ? <><Body>A single initial opening establishes the cashbook start. Following days require the previous day's finalized count.</Body>
          <Action title="Record initial opening for selected day" disabled={mutation.busy || !reason.trim()} onPress={() => { const body = { date: day.date, amount, reason };void mutation.post("cash.open", body, key => getOperationsApi().openCashbook(body, key), reload); }} /></> : null}
        <FormField label="Actual counted closing cash across the restaurant and drivers" value={count} onChangeText={setCount} keyboardType="numeric" />
        {(day.missingInputs ?? []).length ? <><Body>Review the original records and record any necessary authorized adjustments before closing. Describe how missing historical inputs were reconciled in the reason above.</Body>
          <FormToggle label="I have reconciled the missing historical cash inputs" value={acknowledge} onChange={setAcknowledge} /></> : null}
        <Action title="Review and finalize selected day's count" disabled={mutation.busy || day.openingBalance === null || day.closing !== null || !count || !!(day.missingInputs ?? []).length && (!acknowledge || !reason.trim())} onPress={() => setConfirm(day)} />
      </Card>
    </>}</QueryResult>
    <Card title="Other authorized physical cash movement">
      <Choices<CashMovementKind> label="Movement type" value={kind} values={movementKinds} onChange={setKind} />
      <Choices<"IN" | "OUT"> label="Cash direction" value={direction} values={["IN", "OUT"] as const} onChange={setDirection} />
      <FormField label="Exact movement timestamp with offset" value={occurredAt} onChangeText={setOccurredAt} autoCapitalize="none" />
      <Body>Use the amount and reason above. Record a new physical cash event; existing sales, purchases and expenses already appear automatically.</Body>
      <Action title="Post authorized cash movement" disabled={mutation.busy || !reason.trim()} onPress={() => { void mutation.post("cash.movement", movement, key => getOperationsApi().createCashMovement(movement, key), reload); }} />
    </Card>
    <Card title="Chronological cash transactions">
      <QueryResult {...transactions}>{data => <>
        {data.items.map(item => <Card key={item.id} title={`${item.source.replaceAll("_", " ")} · ${financialAmount(item.signedAmount)}`}>
          <Body>{item.occurredAt} · {item.description}</Body><Body>Source {item.sourceId} · Recorded by {item.recordedBy ?? "Historical cashier unavailable"}</Body>
          {movementKinds.includes(item.source as CashMovementKind) ? <Action title="Record opposite movement as a reversal now" secondary disabled={mutation.busy || !reason.trim()} onPress={() => { void mutation.post(`cash.movement.reverse:${item.id}`, { reason }, key => getOperationsApi().reverseCashMovement(item.id, reason, key), reload); }} /> : null}
        </Card>)}
        {!data.items.length ? <Body>No cash transactions in this period.</Body> : null}
        <Body>{data.total} transactions · Page {page + 1}</Body>
        <Action title="Previous transactions" secondary disabled={page === 0} onPress={() => setPage(v => v - 1)} />
        <Action title="Next transactions" secondary disabled={(page + 1) * data.size >= data.total} onPress={() => setPage(v => v + 1)} />
      </>}</QueryResult>
    </Card>
    <Card title="Historical closing records">
      <QueryResult {...closings}>{data => <>{data.items.map(item => <Card key={item.id} title={`${item.date} · Revision ${item.revision}`}>
        <Body>Expected {financialAmount(item.expectedCash)} · Counted {financialAmount(item.actualCash)} · Variance {financialAmount(item.variance)}</Body>
        <Body>Closed {item.closedAt} by {item.responsibleMember}</Body>
        {item.reconciliationNote ? <Body>Reconciliation note: {item.reconciliationNote}</Body> : null}
        {item.reversedAt ? <Body>Reversed {item.reversedAt} by {item.reversedBy}: {item.reversalReason}</Body> : <Action title="Reverse this finalized count with reason" secondary disabled={mutation.busy || !reason.trim()} onPress={() => { void mutation.post(`cash.closing.reverse:${item.id}`, { reason }, key => getOperationsApi().reverseCashClosing(item.id, reason, key), reload); }} />}
      </Card>)}
        {!data.items.length ? <Body>No finalized counts in this period.</Body> : null}
        <Action title="Previous closing records" secondary disabled={closingPage === 0} onPress={() => setClosingPage(v => v - 1)} />
        <Action title="Next closing records" secondary disabled={(closingPage + 1) * data.size >= data.total} onPress={() => setClosingPage(v => v + 1)} />
      </>}</QueryResult>
    </Card>
    <ConfirmDialog visible={confirm !== null} title="Finalize the cash count" message={`${confirm?.date ?? ""}: expected ${financialAmount(confirm?.expectedClosingCash ?? null)}, counted ${financialAmount(count)}. Include driver-held cash. Later cash corrections require a controlled reversal. Verify all receipts and payouts first.`} confirmLabel="Finalize counted cash" onCancel={() => setConfirm(null)} onConfirm={() => { if (!confirm) return;const body = { date: confirm.date, actualCash: count, acknowledgeMissingInputs: acknowledge, reconciliationReason: reason || undefined };setConfirm(null);void mutation.post("cash.close", body, key => getOperationsApi().closeCashbook(body, key), reload); }} />
  </Page>;
}
