import { useState } from "react";
import type { ExpenseCategory, ExpenseCreate, ExpensePayment, ExpensePaymentMethod, ExpenseQuery, ExpenseRecord } from "@restaurant-platform/api-client";
import type { AccountingChronology } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, DataTable, FormField, Page } from "../../components/ui";
import { MutationFeedback } from "../../components/forms";
import { Choices } from "../management/controls";
import { useApiQuery } from "../../hooks/useApiQuery";
import { FinancialPagination } from "./FinancialPagination";
import type { FinancialRequestKeys } from "./financial-requests";
import {
  chronologicalLabels, financialAmount, useFinancialAction, validFinancialAmount,
  validFinancialDate, validFinancialDateRange, validFinancialTimestamp
} from "./expense-cash-form";

const categories = ["RENT", "SALARIES_WAGES", "ELECTRICITY", "WATER", "INTERNET", "TRANSPORT", "PACKAGING", "EQUIPMENT_MAINTENANCE", "MARKETING", "MISCELLANEOUS"] as const;
const statuses = ["ALL", "UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
const methods = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"] as const;
const periods = ["DAY", "MONTH", "YEAR"] as const;
const pageSize = 20;

type ExpenseView = { kind: "register" | "add" | "templates" } | { kind: "detail" | "edit"; id: string };
type ExpenseFilters = Pick<ExpenseQuery, "from" | "to" | "search" | "category" | "paymentStatus" | "sort">;
type ExpenseDraft = Omit<ExpenseCreate, "payee" | "receiptId"> & { payee: string; receiptId: string };

function label(value: string) { return value.replaceAll("_", " ").toLowerCase(); }

export function ExpenseScreen({ requestKeys }: { requestKeys: FinancialRequestKeys }) {
  const [view, setView] = useState<ExpenseView>({ kind: "register" });
  const [filters, setFilters] = useState<ExpenseFilters>({ sort: "NEWEST" });
  const [page, setPage] = useState(0);
  const back = () => setView({ kind: "register" });
  const open = (id: string) => setView({ kind: "detail", id });
  if (view.kind === "add") return <Page title="Add expense">
    <Action title="Back to expense register" secondary onPress={back} />
    <ExpenseEditor requestKeys={requestKeys} onSaved={open} />
  </Page>;
  if (view.kind === "templates") return <ExpenseTemplates requestKeys={requestKeys} onBack={back} />;
  if (view.kind === "edit" || view.kind === "detail") return <ExpenseDetailScreen key={view.id} id={view.id}
    editing={view.kind === "edit"} requestKeys={requestKeys} onBack={view.kind === "edit" ? () => open(view.id) : back}
    onEdit={() => setView({ kind: "edit", id: view.id })} onSaved={open} />;
  return <ExpenseRegister filters={filters} page={page} onPageChange={setPage}
    onApply={value => { setFilters(value); setPage(0); }}
    onOpen={open} onAdd={() => setView({ kind: "add" })} onTemplates={() => setView({ kind: "templates" })} />;
}

function ExpenseRegister({ filters, page, onApply, onPageChange, onOpen, onAdd, onTemplates }: {
  filters: ExpenseFilters; page: number; onApply(value: ExpenseFilters): void; onPageChange(page: number): void;
  onOpen(id: string): void; onAdd(): void; onTemplates(): void;
}) {
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [search, setSearch] = useState(filters.search ?? "");
  const [category, setCategory] = useState<ExpenseCategory | "ALL">(filters.category ?? "ALL");
  const [status, setStatus] = useState<typeof statuses[number]>(filters.paymentStatus ?? "ALL");
  const [sort, setSort] = useState<AccountingChronology>(filters.sort ?? "NEWEST");
  const [period, setPeriod] = useState<typeof periods[number]>("DAY");
  const [error, setError] = useState("");
  const query = useApiQuery(signal => getOperationsApi().listExpenses({ ...filters, page, size: pageSize }, { signal }), JSON.stringify(["expenses", filters, page]));
  const report = useApiQuery(signal => getOperationsApi().getExpenseReport({ from: filters.from, to: filters.to, period }, { signal }), JSON.stringify(["expense-report", filters.from, filters.to, period]));
  function reload() { query.reload(); report.reload(); }
  function apply() {
    if (!validFinancialDateRange(from, to)) {
      setError("Enter a chronological date range of up to 366 days.");
      return;
    }
    setError("");
    onApply({ from: from || undefined, to: to || undefined, search: search.trim() || undefined,
      category: category === "ALL" ? undefined : category, paymentStatus: status === "ALL" ? undefined : status, sort });
    reload();
  }
  return <Page title="Expense register" subtitle="Operating obligations and their separate payment records. Amounts use whole currency units." onRefresh={reload}>
    <Action title="Add expense" onPress={onAdd} />
    <Action title="Recurring expense templates" secondary onPress={onTemplates} />
    <Card title="Search and filter expenses">
      <FormField label="From date (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder="Blank for restaurant today" />
      <FormField label="Through date (YYYY-MM-DD)" value={to} onChangeText={setTo} error={error || undefined} />
      <FormField label="Search descriptions or payees" value={search} onChangeText={setSearch} maxLength={200} returnKeyType="search" onSubmitEditing={apply} />
      <Choices label="Category filter" value={category} values={["ALL", ...categories]} labels={{ ALL: "All categories" }} onChange={setCategory} />
      <Choices label="Payment status filter" value={status} values={statuses} labels={{ ALL: "All statuses" }} onChange={setStatus} />
      <Choices label="Sort by expense date" value={sort} values={["NEWEST", "OLDEST"]} labels={chronologicalLabels} onChange={setSort} />
      <Action title="Load expenses" onPress={apply} />
    </Card>
    <QueryResult {...query}>{data => <>
      {data.items.length === 0 ? <Card title="No matching expenses"><Body>Change the filters or add an expense.</Body></Card> : null}
      {data.items.map(expense => <Card key={expense.id} title={expense.description}>
        <Body>{expense.expenseDate} · {label(expense.category)} · {label(expense.paymentStatus)}</Body>
        {expense.payee ? <Body>Payee {expense.payee}</Body> : null}
        <Body>Amount {financialAmount(expense.amount)} · Paid {financialAmount(expense.paidAmount)} · Outstanding {financialAmount(expense.outstandingAmount)}</Body>
        <Action title="View expense detail" secondary onPress={() => onOpen(expense.id)} />
      </Card>)}
      <Body>{data.total} expenses</Body>
      <FinancialPagination page={page} totalPages={Math.ceil(data.total / data.size)} onPageChange={onPageChange} />
    </>}</QueryResult>
    <Card title="Expense totals by category">
      <Choices label="Group dates by" value={period} values={periods} onChange={setPeriod} />
      <QueryResult {...report}>{data => <>
        <Body>{data.from} through {data.to}. The totals include all categories and payment statuses in this date range.</Body>
        <DataTable columns={["Period", "Category", "Posted", "Cancelled", "Net expense"]} rows={data.totals.map(row => ({
          key: `${row.periodStart}:${row.category}`, cells: [row.periodStart, label(row.category), financialAmount(row.postedAmount),
            financialAmount(row.cancelledAmount), financialAmount(row.expenseAmount)]
        }))} />
      </>}</QueryResult>
    </Card>
  </Page>;
}

function ExpenseFields({ draft, onChange, template = false }: { draft: ExpenseDraft; onChange(value: ExpenseDraft): void; template?: boolean }) {
  return <>
    <Choices label="Expense category" value={draft.category} values={categories} onChange={category => onChange({ ...draft, category })} />
    <FormField label="Whole-currency amount" value={draft.amount} onChangeText={amount => onChange({ ...draft, amount })} keyboardType="number-pad" maxLength={19} />
    <FormField label={template ? "First occurrence date (YYYY-MM-DD)" : "Expense date (YYYY-MM-DD)"} value={draft.expenseDate} onChangeText={expenseDate => onChange({ ...draft, expenseDate })} maxLength={10} />
    <FormField label="Description" value={draft.description} onChangeText={description => onChange({ ...draft, description })} maxLength={2000} multiline />
    <FormField label="Payee (optional)" value={draft.payee} onChangeText={payee => onChange({ ...draft, payee })} maxLength={200} />
    {!template ? <FormField label="Private receipt ID (optional)" value={draft.receiptId} onChangeText={receiptId => onChange({ ...draft, receiptId })} autoCapitalize="none" maxLength={36} /> : null}
  </>;
}

function expenseDraft(existing?: ExpenseRecord): ExpenseDraft {
  return { category: existing?.category ?? "RENT", amount: existing?.amount ?? "", expenseDate: existing?.expenseDate ?? "",
    description: existing?.description ?? "", payee: existing?.payee ?? "", receiptId: existing?.receiptId ?? "" };
}

function expenseBody(draft: ExpenseDraft): ExpenseCreate {
  return { ...draft, description: draft.description.trim(), payee: draft.payee.trim() || null, receiptId: draft.receiptId.trim() || null };
}

function validExpense(draft: ExpenseDraft) {
  return validFinancialDate(draft.expenseDate) && validFinancialAmount(draft.amount) && Boolean(draft.description.trim()) &&
    (!draft.receiptId.trim() || /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(draft.receiptId.trim()));
}

function ExpenseEditor({ original, requestKeys, onSaved }: { original?: ExpenseRecord; requestKeys: FinancialRequestKeys; onSaved(id: string): void }) {
  const [draft, setDraft] = useState(() => expenseDraft(original));
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const mutation = useFinancialAction(requestKeys);
  function submit() {
    setReview(false);
    const body = expenseBody(draft);
    if (original) {
      const correction = { replacement: body, reason: reason.trim() };
      void mutation.post(`expense.correct:${original.id}`, correction,
        key => getOperationsApi().correctExpense(original.id, correction, key), value => onSaved(value.id));
      return;
    }
    void mutation.post("expense.create", body, key => getOperationsApi().createExpense(body, key), value => {
      requestKeys.complete("expense.create", body);
      onSaved(value.id);
    });
  }
  const disabled = mutation.busy || !validExpense(draft) || Boolean(original && !reason.trim());
  return <Card title={original ? "Replacement expense" : "Record an expense obligation"}>
    <Body>{original ? "Saving cancels the original and posts a replacement with a linked audit reason." : "Posting records an unpaid operating obligation. Record payment separately. Use Purchase History for inventory purchases."}</Body>
    <ExpenseFields draft={draft} onChange={setDraft} />
    {original ? <FormField label="Correction reason" value={reason} onChangeText={setReason} maxLength={2000} multiline /> : null}
    <Body>Provide a valid date, positive whole-currency amount and description.</Body>
    <MutationFeedback {...mutation} />
    <Action title={original ? "Review correction" : "Post expense"} disabled={disabled} onPress={original ? () => setReview(true) : submit} />
    <ConfirmDialog visible={review} title="Correct this expense" message="The original will remain in history as cancelled. A replacement and linked audit records will be posted together."
      confirmLabel="Post replacement expense" onCancel={() => setReview(false)} onConfirm={submit} />
  </Card>;
}

function ExpenseDetailScreen({ id, editing, requestKeys, onBack, onEdit, onSaved }: {
  id: string; editing: boolean; requestKeys: FinancialRequestKeys; onBack(): void; onEdit(): void; onSaved(id: string): void;
}) {
  const query = useApiQuery(signal => getOperationsApi().getExpense(id, { signal }), `expense-detail:${id}`);
  return <Page title={editing ? "Edit expense" : "Expense detail"} onRefresh={query.reload}>
    <Action title={editing ? "Back to expense detail" : "Back to expense register"} secondary onPress={onBack} />
    <QueryResult {...query}>{data => {
      const canCorrect = !data.expense.cancelledAt && data.expense.paidAmount === "0";
      if (editing) return canCorrect ? <ExpenseEditor original={data.expense} requestKeys={requestKeys} onSaved={onSaved} /> :
        <Card><Body>This record can be corrected only while active and after any payments have been reversed.</Body></Card>;
      return <ExpenseDetails expense={data.expense} payments={data.payments} canCorrect={canCorrect} requestKeys={requestKeys} onEdit={onEdit} onSaved={query.reload} />;
    }}</QueryResult>
  </Page>;
}

function ExpenseDetails({ expense, payments, canCorrect, requestKeys, onEdit, onSaved }: {
  expense: ExpenseRecord; payments: ExpensePayment[];
  canCorrect: boolean; requestKeys: FinancialRequestKeys; onEdit(): void; onSaved(): void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ExpensePaymentMethod>("CASH");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString());
  const [reason, setReason] = useState("");
  const [correction, setCorrection] = useState<{ paymentId: string } | "cancel" | null>(null);
  const mutation = useFinancialAction(requestKeys);
  const canPay = !expense.cancelledAt && expense.outstandingAmount !== "0";
  function pay() {
    const body = { amount, method, paidAt };
    void mutation.post(`expense.pay:${expense.id}`, body, key => getOperationsApi().payExpense(expense.id, body, key), onSaved);
  }
  function correct() {
    const body = { reason: reason.trim() };
    const selected = correction;
    setCorrection(null);
    if (selected === "cancel") {
      void mutation.post(`expense.cancel:${expense.id}`, body, key => getOperationsApi().cancelExpense(expense.id, body.reason, key), onSaved);
    } else if (selected) {
      void mutation.post(`expense.payment.reverse:${selected.paymentId}`, body,
        key => getOperationsApi().reverseExpensePayment(expense.id, selected.paymentId, body.reason, key), onSaved);
    }
  }
  return <>
    <Card title={expense.description}>
      <Body>{expense.expenseDate} · {label(expense.category)} · {label(expense.paymentStatus)}</Body>
      {expense.payee ? <Body>Payee {expense.payee}</Body> : null}
      <Body>Original amount {financialAmount(expense.amount)} · Paid {financialAmount(expense.paidAmount)} · Outstanding {financialAmount(expense.outstandingAmount)}</Body>
      <Body>Recorded {expense.createdAt} by {expense.recordedBy}</Body>
      <Body>Expense record {expense.id}</Body>
      {expense.receiptId ? <Body>Private receipt {expense.receiptId}</Body> : null}
      {expense.cancelledAt ? <Body>Cancelled {expense.cancelledAt} by {expense.cancelledBy}. Reason {expense.cancellationReason}</Body> : null}
      {canCorrect ? <Action title="Edit expense by posting a correction" secondary onPress={onEdit} disabled={mutation.busy} /> : null}
    </Card>
    <MutationFeedback {...mutation} />
    {canPay ? <Card title="Record payment">
      <FormField label="Whole-currency payment amount" value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={19} />
      <Choices label="Payment method" value={method} values={methods} onChange={setMethod} />
      <FormField label="Actual payment timestamp (ISO 8601 with offset)" value={paidAt} onChangeText={setPaidAt} autoCapitalize="none" />
      <Action title="Record actual payment" disabled={mutation.busy || !validFinancialAmount(amount) || !validFinancialTimestamp(paidAt)} onPress={pay} />
    </Card> : null}
    <Card title="Payment history">
      {!payments.length ? <Body>No payments recorded for this expense.</Body> : null}
      {payments.map(payment => <Card key={payment.id} title={`${label(payment.method)} · ${financialAmount(payment.amount)}`}>
        <Body>Paid {payment.paidAt}. Recorded by {payment.recordedBy} at {payment.createdAt}.</Body>
        {payment.reversedAt ? <Body>Reversed {payment.reversedAt} by {payment.reversedBy}. Reason {payment.reversalReason}</Body> :
          <Action title="Reverse returned payment" secondary disabled={mutation.busy} onPress={() => { setReason(""); setCorrection({ paymentId: payment.id }); }} />}
      </Card>)}
    </Card>
    {canCorrect ? <Action title="Cancel this expense" secondary disabled={mutation.busy} onPress={() => { setReason(""); setCorrection("cancel"); }} /> : null}
    {correction ? <Card title={correction === "cancel" ? "Confirm expense cancellation" : "Confirm returned funds"}>
      <Body>{correction === "cancel" ? "The expense will remain in the register with its cancellation reason." : "Record a reversal only after funds have been returned. The reversal restores the unpaid balance."}</Body>
      <FormField label="Reason for this correction" value={reason} onChangeText={setReason} maxLength={2000} multiline />
      <Action title={correction === "cancel" ? "Confirm cancellation" : "Record payment reversal"} disabled={mutation.busy || !reason.trim()} onPress={correct} />
      <Action title="Back to expense detail" secondary onPress={() => setCorrection(null)} />
    </Card> : null}
  </>;
}

function ExpenseTemplates({ requestKeys, onBack }: { requestKeys: FinancialRequestKeys; onBack(): void }) {
  const [draft, setDraft] = useState(() => expenseDraft());
  const [frequency, setFrequency] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [occurrence, setOccurrence] = useState("");
  const [reason, setReason] = useState("");
  const query = useApiQuery(signal => getOperationsApi().listExpenseTemplates({ signal }), "expense-templates");
  const mutation = useFinancialAction(requestKeys);
  function create() {
    const body = { category: draft.category, amount: draft.amount, description: draft.description.trim(),
      payee: draft.payee.trim() || null, frequency, startsOn: draft.expenseDate };
    void mutation.post("expense.template", body, key => getOperationsApi().createExpenseTemplate(body, key), () => {
      requestKeys.complete("expense.template", body);
      setDraft(expenseDraft());
      query.reload();
    });
  }
  return <Page title="Recurring expense templates" onRefresh={query.reload}>
    <Action title="Back to expense register" secondary onPress={onBack} />
    <MutationFeedback {...mutation} />
    <Card title="Add a recurring template">
      <ExpenseFields draft={draft} onChange={setDraft} template />
      <Choices label="Recurrence" value={frequency} values={["MONTHLY", "YEARLY"]} onChange={setFrequency} />
      <Body>Confirm each occurrence separately to post an expense.</Body>
      <Action title="Save recurring template" disabled={mutation.busy || !validExpense(draft)} onPress={create} />
    </Card>
    <Card title="Existing templates">
      <FormField label="Occurrence date to confirm (YYYY-MM-DD)" value={occurrence} onChangeText={setOccurrence} />
      <FormField label="Reason to stop a template" value={reason} onChangeText={setReason} maxLength={2000} />
      <QueryResult {...query}>{items => <>
        {!items.length ? <Body>No recurring expense templates.</Body> : null}
        {items.map(template => <Card key={template.id} title={template.description}>
          <Body>{label(template.category)} · {financialAmount(template.amount)} · {label(template.frequency)} from {template.startsOn} · {template.active ? "Active" : "Stopped"}</Body>
          {template.active ? <>
            <Action title="Confirm and post selected occurrence" disabled={mutation.busy || !validFinancialDate(occurrence)}
              onPress={() => { void mutation.post(`template.confirm:${template.id}`, occurrence,
                key => getOperationsApi().confirmExpenseTemplate(template.id, occurrence, key), query.reload); }} />
            <Action title="Stop recurring template" secondary disabled={mutation.busy || !reason.trim()}
              onPress={() => { void mutation.post(`template.stop:${template.id}`, reason,
                key => getOperationsApi().stopExpenseTemplate(template.id, reason.trim(), key), query.reload); }} />
          </> : null}
        </Card>)}
      </>}</QueryResult>
    </Card>
  </Page>;
}
