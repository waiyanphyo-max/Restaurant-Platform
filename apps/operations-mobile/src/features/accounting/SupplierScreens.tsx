import { useState } from "react";
import type { AccountingSupplier, PayableSort, SupplierSort } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { FormToggle, MutationFeedback } from "../../components/forms";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, FormField } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { FinancialPagination } from "./FinancialPagination";
import type { FinancialRequestKeys } from "./financial-requests";
import { procurementMoney as money } from "./procurement-format";

const pageSize = 20;
const supplierSortLabels = { NAME_ASC: "Name A–Z", NAME_DESC: "Name Z–A" } as const;
const payableSortLabels = { NAME_ASC: "Supplier name", OUTSTANDING_DESC: "Largest outstanding", DUE_ASC: "Earliest due" } as const;

export type SupplierSelection = Pick<AccountingSupplier, "id" | "name">;

export function SupplierPicker({ value, onChange, disabled = false, emptyLabel = "Unspecified" }: {
  value: SupplierSelection | null;
  onChange(supplier: SupplierSelection | null): void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return <Card title="Supplier">
    <Body>{value?.name ?? emptyLabel}</Body>
    <Action title={open ? "Close supplier picker" : "Choose supplier"} secondary disabled={disabled} onPress={() => setOpen(!open)} />
    {value ? <Action title="Clear selected supplier" secondary disabled={disabled} onPress={() => onChange(null)} /> : null}
    {open && !disabled ? <SupplierOptions onSelect={supplier => { onChange(supplier); setOpen(false); }} /> : null}
  </Card>;
}

function SupplierOptions({ onSelect }: { onSelect(supplier: SupplierSelection): void }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const query = useApiQuery(signal => getOperationsApi().listAccountingSuppliers({ search: term, page, size: pageSize }, { signal }),
    JSON.stringify(["supplier-picker", term, page]));
  return <>
    <FormField label="Find a supplier by name" value={search} onChangeText={setSearch} maxLength={150} returnKeyType="search"
      onSubmitEditing={() => { setTerm(search.trim()); setPage(0); }} />
    <Action title="Search supplier choices" secondary onPress={() => { setTerm(search.trim()); setPage(0); }} />
    <QueryResult {...query}>{result => <>
      {result.content.length ? null : <Body>No suppliers match this search.</Body>}
      {result.content.map(supplier => <Action key={supplier.id} title={`Select ${supplier.name}${supplier.active ? "" : " (inactive)"}`}
        secondary onPress={() => onSelect({ id: supplier.id, name: supplier.name })} />)}
      <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setPage} />
    </>}</QueryResult>
  </>;
}

export function SupplierRegister({ requests }: { requests: FinancialRequestKeys }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<SupplierSort>("NAME_ASC");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<{ supplier: AccountingSupplier | null } | null>(null);
  const [statement, setStatement] = useState<SupplierSelection | null>(null);
  const query = useApiQuery(signal => getOperationsApi().listAccountingSuppliers({ search: term, sort, page, size: pageSize }, { signal }),
    JSON.stringify(["suppliers", term, sort, page]));
  if (form) return <SupplierForm supplier={form.supplier} requests={requests} onBack={() => setForm(null)}
    onSaved={() => { setForm(null); query.reload(); }} />;
  if (statement) return <SupplierHistory supplier={statement} onBack={() => setStatement(null)} />;
  return <Card title="Supplier register">
    <Action title="Add supplier" onPress={() => setForm({ supplier: null })} />
    <FormField label="Find a supplier by name" value={search} onChangeText={setSearch} maxLength={150} returnKeyType="search"
      onSubmitEditing={() => { setTerm(search.trim()); setPage(0); }} />
    <Action title="Search supplier register" secondary onPress={() => { setTerm(search.trim()); setPage(0); }} />
    <Choices label="Sort suppliers" value={sort} values={["NAME_ASC", "NAME_DESC"]} labels={supplierSortLabels}
      onChange={value => { setSort(value); setPage(0); }} />
    <QueryResult {...query}>{result => <>
      {result.content.length ? null : <Body>No suppliers match this search.</Body>}
      {result.content.map(supplier => <Card key={supplier.id} title={supplier.name}>
        <Body>{supplier.active ? "Active supplier" : "Inactive supplier"}</Body>
        <Body>{supplier.contact ?? "No contact details recorded."}</Body>
        <Action title={`Edit ${supplier.name}`} secondary onPress={() => setForm({ supplier })} />
        <Action title={`Payment history for ${supplier.name}`} secondary onPress={() => setStatement(supplier)} />
      </Card>)}
      <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setPage} />
    </>}</QueryResult>
  </Card>;
}

function SupplierForm({ supplier, requests, onBack, onSaved }: {
  supplier: AccountingSupplier | null;
  requests: FinancialRequestKeys;
  onBack(): void;
  onSaved(): void;
}) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contact ?? "");
  const [active, setActive] = useState(supplier?.active ?? true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation();

  function save() {
    if (!name.trim() || supplier && !reason.trim()) {
      setError(supplier ? "Enter a supplier name and a correction reason." : "Enter a supplier name.");
      return;
    }
    setError(null);
    const body = { name: name.trim(), contact: contact.trim() || null, active, reason: supplier ? reason.trim() : undefined };
    const operation = `supplier:${supplier?.id ?? "new"}`;
    const key = requests.key(operation, body);
    void mutation.run(() => supplier ? getOperationsApi().updateAccountingSupplier(supplier.id, body, key)
      : getOperationsApi().createAccountingSupplier(body, key), () => { requests.complete(operation, body); onSaved(); });
  }

  return <Card title={supplier ? `Edit supplier · ${supplier.name}` : "Add supplier"}>
    <FormField label="Supplier name" value={name} onChangeText={setName} maxLength={150} editable={!mutation.busy} />
    <FormField label="Supplier contact details" value={contact} onChangeText={setContact} maxLength={500} multiline editable={!mutation.busy} />
    <FormToggle label="Active supplier" value={active} onChange={setActive} disabled={mutation.busy} />
    {supplier ? <FormField label="Correction reason" value={reason} onChangeText={setReason} maxLength={1000} editable={!mutation.busy} /> : null}
    <MutationFeedback {...mutation} error={error ?? mutation.error} />
    <Action title="Save supplier" disabled={mutation.busy} onPress={save} />
    <Action title="Back to supplier register" secondary disabled={mutation.busy} onPress={onBack} />
  </Card>;
}

export function Payables() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<PayableSort>("OUTSTANDING_DESC");
  const [page, setPage] = useState(0);
  const [statement, setStatement] = useState<SupplierSelection | null>(null);
  const query = useApiQuery(signal => getOperationsApi().getSupplierPayables({ search: term, sort, page, size: pageSize }, { signal }),
    JSON.stringify(["payables", term, sort, page]));
  if (statement) return <SupplierHistory supplier={statement} onBack={() => setStatement(null)} />;
  return <Card title="Payables">
    <Body>Confirmed supplier purchases, effective payments and balances owed.</Body>
    <FormField label="Find a supplier by name" value={search} onChangeText={setSearch} maxLength={150} returnKeyType="search"
      onSubmitEditing={() => { setTerm(search.trim()); setPage(0); }} />
    <Action title="Search payables" secondary onPress={() => { setTerm(search.trim()); setPage(0); }} />
    <Choices label="Sort payables" value={sort} values={["OUTSTANDING_DESC", "DUE_ASC", "NAME_ASC"]} labels={payableSortLabels}
      onChange={value => { setSort(value); setPage(0); }} />
    <QueryResult {...query}>{result => <>
      {result.content.length ? null : <Body>No supplier balances match this search.</Body>}
      {result.content.map(row => <Card key={row.supplierId} title={row.supplierName}>
        <Body>Confirmed obligations {money(row.confirmedObligations)}</Body>
        <Body>Paid {money(row.amountPaid)}</Body>
        <Body>Outstanding {money(row.outstandingAmount)}</Body>
        <Body>Earliest unpaid due date {row.earliestUnpaidDueDate ?? "Unspecified"}</Body>
        <Action title={`Payment history for ${row.supplierName}`} secondary
          onPress={() => setStatement({ id: row.supplierId, name: row.supplierName })} />
      </Card>)}
      <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setPage} />
    </>}</QueryResult>
  </Card>;
}

function SupplierHistory({ supplier, onBack }: { supplier: SupplierSelection; onBack(): void }) {
  const [page, setPage] = useState(0);
  const query = useApiQuery(signal => getOperationsApi().listSupplierPayments(supplier.id, { page, size: pageSize }, { signal }),
    JSON.stringify(["supplier-payments", supplier.id, page]));
  return <Card title={`Supplier payment history · ${supplier.name}`}>
    <Action title="Back to suppliers" secondary onPress={onBack} />
    <QueryResult {...query}>{result => <>
      {result.content.length ? null : <Body>No recorded supplier payments.</Body>}
      {result.content.map(row => <Card key={row.payment.id} title={`Invoice ${row.invoiceReference ?? row.purchaseId}`}>
        <Body>{money(row.payment.amount)} · {row.payment.method}</Body>
        <Body>Paid {row.payment.paidAt}</Body>
        {row.payment.reversalId ? <Body>Reversed {row.payment.reversedAt}. {row.payment.reversalReason}</Body> : null}
      </Card>)}
      <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setPage} />
    </>}</QueryResult>
  </Card>;
}
