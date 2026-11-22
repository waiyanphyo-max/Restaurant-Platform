import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { View } from "react-native";
import type { ConfirmPurchaseInput, PurchaseDetail, PurchaseLineInput, ShoppingSheet } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { readEmbeddedTenant } from "../../tenant";
import { MutationFeedback } from "../../components/forms";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { Choices } from "../management/controls";
import { isIsoDate } from "../operations/format";
import { AccountingAuditScreen } from "./AccountingAuditScreen";
import { FinancialPagination } from "./FinancialPagination";
import { FinancialRequestKeys } from "./financial-requests";
import { procurementMoney, procurementToday, purchaseLineTotal, purchaseOccurrence, purchaseQuantity, purchaseWholeAmount } from "./procurement-format";
import { PurchaseDetailScreen, PurchaseHistory } from "./PurchaseScreens";
import { ShoppingCatalog } from "./ShoppingScreen";
import type { PurchaseAttempt } from "./purchase-attempt";
import { createNativePurchaseAttemptStore } from "./purchase-attempt-native";
import { Payables, SupplierPicker, SupplierRegister, type SupplierSelection } from "./SupplierScreens";

const workspaces = ["RECORD", "HISTORY", "PAYMENTS", "SUPPLIERS", "PAYABLES", "AUDIT"] as const;
const labels = { RECORD: "Record Purchase", HISTORY: "Purchase History", PAYMENTS: "Payments", SUPPLIERS: "Suppliers", PAYABLES: "Payables", AUDIT: "Audit History" };

export function PurchasingScreen() {
  const [workspace, setWorkspace] = useState<typeof workspaces[number]>("RECORD");
  const [replacement, setReplacement] = useState<PurchaseDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [requests] = useState(() => new FinancialRequestKeys());
  const { state } = useOperationsAuth();
  const tenant = readEmbeddedTenant();
  const userId = state.status === "ready" ? state.userId : "";
  const attemptStore = useMemo(() => userId ? createNativePurchaseAttemptStore({ environment: tenant.environment, restaurantId: tenant.restaurantId, userId }) : null,
    [tenant.environment, tenant.restaurantId, userId]);
  const [recovery, setRecovery] = useState<{ ready: boolean; attempt: PurchaseAttempt | null; error: string | null }>({ ready: false, attempt: null, error: null });
  const submission = useApiMutation();
  useEffect(() => {
    let active = true;
    setRecovery({ ready: false, attempt: null, error: null });
    if (attemptStore) void attemptStore.load().then(attempt => {
      if (active) setRecovery({ ready: true, attempt, error: null });
    }).catch(() => { if (active) setRecovery({ ready: false, attempt: null, error: "Pending purchase recovery is unavailable. Reopen this screen after checking secure storage." }); });
    return () => { active = false; };
  }, [attemptStore]);
  function submit(body: ConfirmPurchaseInput, retainedKey?: string) {
    if (!attemptStore || !recovery.ready) return;
    const key = retainedKey ?? requests.key("confirm-purchase", body);
    void submission.run(async () => {
      const attempt = await attemptStore.begin(body, key);
      setRecovery({ ready: true, attempt, error: null });
      try {
        const result = await getOperationsApi().confirmPurchase(attempt.body, attempt.key);
        await attemptStore.complete(attempt.key);
        return result;
      } catch (failure) {
        if (await attemptStore.reject(attempt.key, failure)) setRecovery({ ready: true, attempt: null, error: null });
        throw failure;
      }
    }, result => {
      requests.complete("confirm-purchase", body); setRecovery({ ready: true, attempt: null, error: null });
      setReplacement(null); setSelected(result.purchase.id);
    });
  }
  const settings = useApiQuery(signal => getOperationsApi().getSettings({ signal }), "purchasing-settings");
  function replace(detail: PurchaseDetail) { setReplacement(detail); setSelected(null); setWorkspace("RECORD"); }
  return <Page title="Purchasing & Accounting" subtitle="Actual purchases, payments, supplier balances and financial history">
    <Choices label="Purchasing workspace" value={workspace} values={workspaces} labels={labels} disabled={submission.busy || !!recovery.attempt} onChange={value => { setWorkspace(value); setSelected(null); }} />
    {!recovery.ready ? <Body>{recovery.error ?? "Checking pending purchase recovery…"}</Body> : null}
    {recovery.attempt ? <Card title="Resolve pending purchase">
      <Body>The previous submission may have reached the server. Retry its saved {recovery.attempt.body.lines.length} items with the same request key before starting another purchase.</Body>
      <Action title="Retry saved purchase safely" disabled={submission.busy} onPress={() => { if (recovery.attempt) submit(recovery.attempt.body, recovery.attempt.key); }} />
    </Card> : null}
    <MutationFeedback {...submission} />
    <QueryResult {...settings}>{value => <>
      <Body>Amounts in {value.currency} · Restaurant timezone {value.timezone}</Body>
      {selected ? <PurchaseDetailScreen id={selected} requests={requests} onBack={() => setSelected(null)} onChanged={() => undefined} onSelectPurchase={setSelected} onReplace={replace} /> : <>
        {recovery.ready ? <ViewDraft visible={workspace === "RECORD" && !recovery.attempt}><PurchaseRecorder key={replacement?.purchase.id ?? "new"} timezone={value.timezone} requests={requests} replacement={replacement}
          onClear={() => setReplacement(null)} onSubmit={submit} disabled={submission.busy || !!recovery.attempt} /></ViewDraft> : null}
        {workspace === "HISTORY" || workspace === "PAYMENTS" ? <>
          {workspace === "PAYMENTS" ? <Body>Open a purchase to record a payment, view payment history, or reverse a payment.</Body> : null}
          <PurchaseHistory today={procurementToday(value.timezone)} requests={requests} onReplace={replace} />
        </> : workspace === "SUPPLIERS" ? <SupplierRegister requests={requests} /> : workspace === "PAYABLES" ? <Payables /> : workspace === "AUDIT" ? <AccountingAuditScreen /> : null}
      </>}
    </>}</QueryResult>
  </Page>;
}

// Keep an unsaved purchase draft mounted when moving between purchasing tabs.
function ViewDraft({ visible, children }: PropsWithChildren<{ visible: boolean }>) {
  return <View style={visible ? undefined : { display: "none" }}>{children}</View>;
}

type DraftLine = PurchaseLineInput & { name: string };
function PurchaseRecorder({ timezone, requests, replacement, onClear, onSubmit, disabled }: {
  timezone: string; requests: FinancialRequestKeys; replacement: PurchaseDetail | null; onClear(): void; onSubmit(body: ConfirmPurchaseInput): void; disabled: boolean;
}) {
  const original = replacement?.purchase;
  const [lines, setLines] = useState<DraftLine[]>(() => replacement?.lines.map(line => ({ ...line, name: line.itemName })) ?? []);
  const [source, setSource] = useState<ShoppingSheet | null>(null);
  const [sourceDate, setSourceDate] = useState(procurementToday(timezone));
  const [sourcePage, setSourcePage] = useState(0);
  const [showSheets, setShowSheets] = useState(false);
  const [purchasedAt, setPurchasedAt] = useState(original?.purchasedAt ?? new Date().toISOString());
  const [supplier, setSupplier] = useState<SupplierSelection | null>(() => original?.supplierId && original.supplierName ? { id: original.supplierId, name: original.supplierName } : null);
  const [invoice, setInvoice] = useState(original?.invoiceReference ?? "");
  const [due, setDue] = useState(original?.dueDate ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<ConfirmPurchaseInput | null>(null);
  const [copy, setCopy] = useState<ShoppingSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = { busy: disabled, error: null, message: null };
  useUnsavedChanges(lines.length > 0 || !!supplier || !!invoice || !!due || !!reason);
  function update(index: number, values: Partial<DraftLine>) { setLines(previous => previous.map((line, row) => row === index ? { ...line, ...values } : line)); }
  function review() {
    setError(null);
    try {
      if (!lines.length) throw new Error("Choose at least one purchased item.");
      if (original && !reason.trim()) throw new Error("Enter a replacement reason.");
      const occurrence = purchaseOccurrence(purchasedAt, timezone);
      if (due && (!isIsoDate(due) || due < occurrence.purchaseDate)) throw new Error("Enter a valid due date on or after the purchase date.");
      const actualLines = lines.map(line => {
        if (!line.unit.trim()) throw new Error(`Enter a unit for ${line.name}.`);
        if (!line.unitCost.trim()) throw new Error(`Enter an actual unit cost for ${line.name}.`);
        return { itemId: line.itemId, quantity: purchaseQuantity(line.quantity.trim()), unit: line.unit.trim(), unitCost: purchaseWholeAmount(line.unitCost.trim()), supplierId: supplier?.id ?? null };
      });
      purchaseWholeAmount(actualLines.reduce((sum, line) => sum + BigInt(purchaseLineTotal(line.quantity, line.unitCost)), 0n).toString());
      setPending({ ...occurrence, supplierId: supplier?.id ?? null, lines: actualLines, sheetId: source?.id, invoiceReference: invoice.trim() || null, dueDate: due || null, correctionOfId: original?.id, correctionReason: original ? reason.trim() : undefined });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Check purchase details."); }
  }
  return <>
    <Card title={original ? "Replacement purchase" : "Record actual purchase"}>
      <Body tone="muted">Confirming goods creates an obligation. Record actual payment separately after confirmation. · ကုန်ဝယ်စာရင်းနှင့် အမှန်တကယ်ပေးချေမှုကို သီးခြားမှတ်တမ်းတင်ပါ။</Body>
      {original ? <Body>Replacing cancelled purchase {original.id}.</Body> : <>
        <Action title="Choose a saved shopping sheet…" secondary disabled={mutation.busy} onPress={() => setShowSheets(!showSheets)} />
        {showSheets ? <PurchaseSourceSheets date={sourceDate} onDate={date => { setSourceDate(date); setSourcePage(0); }} page={sourcePage} onPage={setSourcePage} onCopy={setCopy} /> : null}
      </>}
      {source ? <Body>Copied from plan {source.shoppingDate}. Enter actual quantities and costs below.</Body> : null}
      <ShoppingCatalog requests={requests} selected={lines.map(line => line.itemId)} onSelect={item => {
        if (!mutation.busy && !lines.some(line => line.itemId === item.id)) setLines([...lines, { itemId: item.id, name: item.name, quantity: "", unit: item.defaultUnit ?? "", unitCost: "" }]);
      }} />
      {lines.map((line, index) => <Card key={`${line.itemId}:${index}`} title={line.name}>
        <FormField label={`Actual quantity for ${line.name}`} value={line.quantity} keyboardType="decimal-pad" editable={!mutation.busy} onChangeText={quantity => update(index, { quantity })} />
        <FormField label={`Purchase unit for ${line.name}`} value={line.unit} maxLength={30} editable={!mutation.busy} onChangeText={unit => update(index, { unit, unitCost: "" })} />
        <FormField label={`Actual cost per unit for ${line.name}`} value={line.unitCost} keyboardType="number-pad" editable={!mutation.busy} onChangeText={unitCost => update(index, { unitCost })} />
        <PurchaseDraftLineTotal quantity={line.quantity} unitCost={line.unitCost} />
        <Action title={`Remove purchased ${line.name}`} secondary disabled={mutation.busy} onPress={() => setLines(lines.filter((_, row) => row !== index))} />
      </Card>)}
      <FormField label="Actual purchase timestamp (with timezone)" value={purchasedAt} onChangeText={setPurchasedAt} autoCapitalize="none" editable={!mutation.busy} />
      <Action title="Use current purchase time" secondary disabled={mutation.busy} onPress={() => setPurchasedAt(new Date().toISOString())} />
      <FormField label="Invoice or receipt reference (optional)" value={invoice} onChangeText={setInvoice} maxLength={150} editable={!mutation.busy} />
      <FormField label="Due date (optional, YYYY-MM-DD)" value={due} onChangeText={setDue} maxLength={10} editable={!mutation.busy} />
      <SupplierPicker value={supplier} onChange={setSupplier} disabled={mutation.busy} />
      {original ? <FormField label="Replacement reason" value={reason} onChangeText={setReason} maxLength={1000} editable={!mutation.busy} /> : null}
      <MutationFeedback {...mutation} error={error ?? mutation.error} />
      <Action title="Review actual purchase…" disabled={mutation.busy || !lines.length} onPress={review} />
      {original ? <Action title="Discard replacement draft" secondary disabled={mutation.busy} onPress={onClear} /> : null}
    </Card>
    <ConfirmDialog visible={copy !== null} title="Copy plan into purchase draft" message="Replace the current purchase draft items with this plan? Actual costs must be entered before confirming."
      confirmLabel="Copy plan items" onCancel={() => setCopy(null)} onConfirm={() => {
        if (copy) { setSource(copy); setLines(copy.lines.map(line => ({ itemId: line.itemId, name: line.itemName, quantity: line.quantity, unit: line.unit, unitCost: "" }))); }
        setCopy(null); setShowSheets(false);
      }} />
    <ConfirmDialog visible={pending !== null} title="Confirm actual purchase" message={pending ? `Record ${pending.lines.length} purchased items on ${pending.purchaseDate}. Total ${procurementMoney(pending.lines.reduce((sum, line) => sum + BigInt(purchaseLineTotal(line.quantity, line.unitCost)), 0n).toString())}. This creates a purchase obligation.` : ""}
      busy={disabled} confirmDisabled={disabled}
      confirmLabel="Confirm purchased goods" onCancel={() => setPending(null)} onConfirm={() => {
        const body = pending; setPending(null);
        if (body) onSubmit(body);
      }} />
  </>;
}

function PurchaseDraftLineTotal({ quantity, unitCost }: { quantity: string; unitCost: string }) {
  if (!quantity.trim() || !unitCost.trim()) return <Body tone="muted">Line total unavailable until quantity and actual cost are entered. · အရေအတွက်နှင့် အမှန်တကယ်ကုန်ကျစရိတ်ကို ဖြည့်ပါ။</Body>;
  try {
    return <Body>Derived line total · တွက်ချက်ထားသော စုစုပေါင်း: {procurementMoney(purchaseLineTotal(quantity.trim(), unitCost.trim()))}</Body>;
  } catch (failure) {
    return <Body tone="warning">{failure instanceof Error ? failure.message : "Check quantity and actual cost."} · အရေအတွက်နှင့် ကုန်ကျစရိတ်ကို စစ်ဆေးပါ။</Body>;
  }
}

function PurchaseSourceSheets({ date, onDate, page, onPage, onCopy }: { date: string; onDate(date: string): void; page: number; onPage(page: number): void; onCopy(sheet: ShoppingSheet): void }) {
  const selectedDate = isIsoDate(date) ? date : undefined;
  const sheets = useApiQuery(signal => getOperationsApi().listShoppingSheets({ from: selectedDate, to: selectedDate, page, size: 20 }, { signal }), JSON.stringify(["purchase-source-sheets", selectedDate, page]));
  return <Card title="Select a shopping plan">
    <FormField label="Plan date (YYYY-MM-DD)" value={date} onChangeText={onDate} maxLength={10} error={selectedDate ? undefined : "Enter a valid plan date."} />
    <QueryResult {...sheets}>{result => <>
      {result.content.filter(sheet => sheet.status === "PLANNED").map(sheet => <Action key={sheet.id} title={`Copy ${sheet.shoppingDate} sheet · ${sheet.lines.length} items`} secondary onPress={() => onCopy(sheet)} />)}
      {result.content.some(sheet => sheet.status === "PLANNED") ? null : <Body>No available plans on this date.</Body>}
      <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={onPage} />
    </>}</QueryResult>
  </Card>;
}
