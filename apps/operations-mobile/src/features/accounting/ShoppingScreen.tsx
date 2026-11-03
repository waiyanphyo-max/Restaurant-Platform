import { useState } from "react";
import type { ConfirmPurchaseInput, PurchaseDetail, ShoppingItem, ShoppingItemSort, ShoppingLine, ShoppingLineInput, ShoppingSheet } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { FormToggle, MutationFeedback } from "../../components/forms";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { isIsoDate } from "../operations/format";
import { FinancialPagination } from "./FinancialPagination";
import { FinancialRequestKeys } from "./financial-requests";
import { procurementMoney as money, procurementToday, purchaseOccurrence, purchaseQuantity, purchaseWholeAmount } from "./procurement-format";
import { PurchaseDetailScreen, PurchaseHistory } from "./PurchaseScreens";
import { Payables, SupplierPicker, SupplierRegister, type SupplierSelection } from "./SupplierScreens";

type Workspace = "SHOPPING" | "PURCHASES" | "SUPPLIERS" | "PAYABLES";
type DraftLine = ShoppingLineInput & { name: string; draftId: string };
const workspaceLabels = { SHOPPING: "Shopping list", PURCHASES: "Purchase history", SUPPLIERS: "Supplier register", PAYABLES: "Payables" } as const;
const catalogSortLabels = { NAME_ASC: "Name A–Z", NAME_DESC: "Name Z–A", LAST_PURCHASE_DESC: "Last purchased" } as const;
const sheetStatusLabels = { PLANNED: "Planned", PURCHASED: "Purchased", CANCELLED: "Cancelled" } as const;
const pageSize = 20;

export function ShoppingScreen() {
  const [workspace, setWorkspace] = useState<Workspace>("SHOPPING");
  const [replacement, setReplacement] = useState<PurchaseDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [requests] = useState(() => new FinancialRequestKeys());
  const settings = useApiQuery(signal => getOperationsApi().getSettings({ signal }), "shopping-settings");
  function startReplacement(detail: PurchaseDetail) {
    setReplacement(detail);
    setSelected(null);
    setWorkspace("SHOPPING");
  }
  return <Page title="Shopping and purchases" subtitle="Shopping plans, purchase history and supplier balances">
    <Choices label="Procurement workspace" value={workspace} values={["SHOPPING", "PURCHASES", "SUPPLIERS", "PAYABLES"]}
      labels={workspaceLabels} onChange={value => { setWorkspace(value); setSelected(null); }} />
    <QueryResult {...settings}>{value => <>
      <Body>Amounts in {value.currency} · Restaurant timezone {value.timezone}</Body>
      {selected ? <PurchaseDetailScreen id={selected} requests={requests} onBack={() => setSelected(null)}
        onChanged={() => undefined} onSelectPurchase={setSelected} onReplace={startReplacement} />
        : workspace === "SHOPPING" ? <ShoppingPlanner key={replacement?.purchase.id ?? "shopping"} timezone={value.timezone}
          requests={requests} replacement={replacement} onClearReplacement={() => setReplacement(null)}
          onPurchase={id => { setReplacement(null); setSelected(id); }} onOpenPurchase={setSelected} />
          : workspace === "PURCHASES" ? <PurchaseHistory today={procurementToday(value.timezone)} requests={requests} onReplace={startReplacement} />
            : workspace === "SUPPLIERS" ? <SupplierRegister requests={requests} /> : <Payables />}
    </>}</QueryResult>
  </Page>;
}

function draftFromHistory(line: ShoppingLine): DraftLine {
  return { draftId: line.id, itemId: line.itemId, name: line.itemName, quantity: line.quantity, unit: line.unit, unitCost: line.unitCost, supplierId: line.supplierId };
}

function ShoppingPlanner({ timezone, requests, replacement, onClearReplacement, onPurchase, onOpenPurchase }: {
  timezone: string;
  requests: FinancialRequestKeys;
  replacement: PurchaseDetail | null;
  onClearReplacement(): void;
  onPurchase(id: string): void;
  onOpenPurchase(id: string): void;
}) {
  const today = procurementToday(timezone);
  const original = replacement?.purchase;
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState(true);
  const [sort, setSort] = useState<ShoppingItemSort>("NAME_ASC");
  const [catalogPage, setCatalogPage] = useState(0);
  const [sheetPage, setSheetPage] = useState(0);
  const [lines, setLines] = useState<DraftLine[]>(() => replacement?.lines.map(draftFromHistory) ?? []);
  const [saved, setSaved] = useState<ShoppingSheet | null>(null);
  const [reason, setReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => original?.purchasedAt ?? new Date().toISOString());
  const [supplier, setSupplier] = useState<SupplierSelection | null>(() =>
    original?.supplierId && original.supplierName ? { id: original.supplierId, name: original.supplierName } : null);
  const [invoice, setInvoice] = useState(original?.invoiceReference ?? "");
  const [due, setDue] = useState(original?.dueDate ?? "");
  const [pending, setPending] = useState<ConfirmPurchaseInput | null>(null);
  const [catalogForm, setCatalogForm] = useState<{ item: ShoppingItem | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation();
  const sheetDate = isIsoDate(date) ? date : today;
  const catalog = useApiQuery(signal => getOperationsApi().listShoppingItems({ search: term, suggestionsOnly: suggestions, sort, page: catalogPage, size: pageSize }, { signal }),
    JSON.stringify(["shopping-items", term, suggestions, sort, catalogPage]));
  const sheets = useApiQuery(signal => getOperationsApi().listShoppingSheets({ from: sheetDate, to: sheetDate, page: sheetPage, size: pageSize }, { signal }),
    JSON.stringify(["shopping-sheets", sheetDate, sheetPage]));

  function updateLine(draftId: string, values: Partial<DraftLine>) {
    setLines(previous => previous.map(line => line.draftId === draftId ? { ...line, ...values } : line));
  }
  function add(item: ShoppingItem) {
    setLines(previous => previous.some(line => line.itemId === item.id) ? previous : [...previous, {
      draftId: item.id, itemId: item.id, name: item.name, quantity: item.defaultQuantity ?? "1", unit: item.defaultUnit,
      unitCost: item.latestCostUnit === item.defaultUnit ? item.latestUnitCost ?? "" : "", supplierId: item.supplierId
    }]);
  }
  function draftLines(): ShoppingLineInput[] {
    if (!lines.length) throw new Error("Choose at least one shopping item.");
    return lines.map(line => {
      const unit = line.unit.trim();
      if (!unit) throw new Error(`Enter a unit for ${line.name}.`);
      if (!line.unitCost.trim()) throw new Error(`Enter a unit cost for ${line.name}.`);
      return { itemId: line.itemId, quantity: purchaseQuantity(line.quantity.trim()), unit,
        unitCost: purchaseWholeAmount(line.unitCost.trim()), supplierId: line.supplierId };
    });
  }
  function savePlan() {
    setError(null);
    try {
      if (!isIsoDate(date)) throw new Error("Enter a valid shopping date.");
      if (saved && !reason.trim()) throw new Error("Enter a correction reason for the saved plan.");
      const body = { shoppingDate: date, lines: draftLines(), reason: saved ? reason.trim() : undefined };
      const operation = `shopping-plan:${saved?.id ?? "new"}`;
      const key = requests.key(operation, body);
      void mutation.run(() => saved ? getOperationsApi().updateShoppingSheet(saved.id, body, key)
        : getOperationsApi().createShoppingSheet(body, key), value => {
        requests.complete(operation, body);
        setSaved(value);
        setReason("");
        sheets.reload();
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check the shopping plan fields.");
    }
  }
  function prepareConfirmation() {
    setError(null);
    try {
      const occurrence = purchaseOccurrence(purchasedAt, timezone);
      if (due && (!isIsoDate(due) || due < occurrence.purchaseDate)) throw new Error("Enter a valid due date on or after the purchase date.");
      if (original && !correctionReason.trim()) throw new Error("Enter a reason for the replacement purchase.");
      const supplierId = supplier?.id ?? null;
      setPending({ ...occurrence, supplierId, lines: draftLines().map(line => ({ ...line, supplierId })), sheetId: saved?.id,
        invoiceReference: invoice.trim() || null, dueDate: due || null, correctionOfId: original?.id,
        correctionReason: original ? correctionReason.trim() : undefined });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check the purchase fields.");
    }
  }
  function openSheet(sheet: ShoppingSheet) {
    if (sheet.purchaseId) { onOpenPurchase(sheet.purchaseId); return; }
    startNewSheet();
    setSaved(sheet);
    setDate(sheet.shoppingDate);
    setLines(sheet.lines.map(draftFromHistory));
  }
  function startNewSheet() {
    setSaved(null);
    setLines([]);
    setReason("");
    setSupplier(null);
    setInvoice("");
    setDue("");
    setPurchasedAt(new Date().toISOString());
    setError(null);
    mutation.reset();
  }
  function searchCatalog() {
    setTerm(search.trim());
    setCatalogPage(0);
    setSuggestions(false);
  }
  if (catalogForm) return <CatalogItemForm item={catalogForm.item} requests={requests} onBack={() => setCatalogForm(null)}
    onSaved={() => { setCatalogForm(null); setSuggestions(false); setCatalogPage(0); catalog.reload(); }} />;
  return <>
    <Card title="Shopping list">
      <Body>Items appear in suggestions through six days after their last confirmed purchase. Older items stay searchable and a new confirmed purchase restores eligibility.</Body>
      <Action title="Add reusable shopping item" secondary disabled={mutation.busy} onPress={() => setCatalogForm({ item: null })} />
      <FormToggle label="Suggested items only" value={suggestions} onChange={value => { setSuggestions(value); setCatalogPage(0); }} />
      <FormField label="Find a shopping item by name" value={search} onChangeText={setSearch} maxLength={150}
        returnKeyType="search" onSubmitEditing={searchCatalog} />
      <Action title="Search all catalog items" secondary onPress={searchCatalog} />
      <Choices label="Sort shopping items" value={sort} values={["NAME_ASC", "NAME_DESC", "LAST_PURCHASE_DESC"]} labels={catalogSortLabels}
        onChange={value => { setSort(value); setCatalogPage(0); }} />
      <QueryResult {...catalog}>{result => <>
        {result.content.length ? null : <Body>{suggestions ? "No current suggestions. Search all catalog items to add one manually." : "No shopping items match this search."}</Body>}
        {result.content.map(item => {
          const added = lines.some(line => line.itemId === item.id);
          return <Card key={item.id} title={item.name}>
            <Body>{item.suggested ? "Currently suggested" : !item.suggestionEnabled ? "Suggestions paused" : "Outside the suggestion window"}</Body>
            <Body>Last confirmed purchase {item.lastConfirmedPurchaseDate ?? "None recorded"}</Body>
            <Body>Latest recorded cost {item.latestUnitCost === null ? "Unknown" : `${money(item.latestUnitCost)} per ${item.latestCostUnit}`}</Body>
            <Action title={added ? `${item.name} added` : `Add ${item.name} to shopping list`} disabled={mutation.busy || added} onPress={() => add(item)} />
            <Action title={`Edit shopping item ${item.name}`} secondary disabled={mutation.busy} onPress={() => setCatalogForm({ item })} />
          </Card>;
        })}
        <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setCatalogPage} />
      </>}</QueryResult>
    </Card>
    <Card title={original ? "Replacement purchase" : saved ? "Saved daily shopping sheet" : "Daily shopping sheet"}>
      {original ? <Body>Replaces cancelled purchase {original.id}. The new purchase keeps its own items, costs and payment history.</Body> : <>
        <FormField label="Shopping plan date (YYYY-MM-DD)" value={date} maxLength={10} editable={!mutation.busy}
          onChangeText={value => { setDate(value); setSheetPage(0); }} />
        <Body>Save a plan for later or confirm goods after the purchase. Record any payment from its purchase detail.</Body>
      </>}
      {lines.length ? null : <Body>No items selected for this sheet.</Body>}
      {lines.map(line => <Card key={line.draftId} title={line.name}>
        <FormField label={`Quantity for ${line.name}`} value={line.quantity} keyboardType="decimal-pad" editable={!mutation.busy}
          onChangeText={quantity => updateLine(line.draftId, { quantity })} />
        <FormField label={`Unit for ${line.name}`} value={line.unit} maxLength={30} editable={!mutation.busy}
          onChangeText={unit => updateLine(line.draftId, { unit, unitCost: "" })} />
        <FormField label={`Cost per unit for ${line.name}`} value={line.unitCost} keyboardType="number-pad" editable={!mutation.busy}
          onChangeText={unitCost => updateLine(line.draftId, { unitCost })} />
        <Action title={`Remove ${line.name}`} secondary disabled={mutation.busy}
          onPress={() => setLines(previous => previous.filter(value => value.draftId !== line.draftId))} />
      </Card>)}
      {original ? <FormField label="Replacement reason" value={correctionReason} onChangeText={setCorrectionReason} maxLength={1000} editable={!mutation.busy} /> : <>
        {saved ? <FormField label="Plan correction reason" value={reason} onChangeText={setReason} maxLength={1000} editable={!mutation.busy} /> : null}
        <Action title={saved ? "Save corrected plan" : "Save shopping plan"} secondary disabled={mutation.busy || !lines.length} onPress={savePlan} />
      </>}
      <Action title={original ? "Discard replacement draft" : "Start a new sheet"} secondary disabled={mutation.busy}
        onPress={original ? onClearReplacement : startNewSheet} />
      <FormField label="Actual purchase timestamp (with timezone)" value={purchasedAt} onChangeText={setPurchasedAt} autoCapitalize="none" editable={!mutation.busy} />
      <Action title="Use current purchase time" secondary disabled={mutation.busy} onPress={() => setPurchasedAt(new Date().toISOString())} />
      <FormField label="Invoice or receipt reference (optional)" value={invoice} onChangeText={setInvoice} maxLength={150} editable={!mutation.busy} />
      <FormField label="Due date (optional, YYYY-MM-DD)" value={due} onChangeText={setDue} maxLength={10} editable={!mutation.busy} />
      <SupplierPicker value={supplier} onChange={setSupplier} disabled={mutation.busy} />
      <MutationFeedback {...mutation} error={error ?? mutation.error} />
      <Action title="Review actual purchase…" disabled={mutation.busy || !lines.length} onPress={prepareConfirmation} />
    </Card>
    {original ? null : <Card title={`Saved sheets for ${sheetDate}`}>
      <QueryResult {...sheets}>{result => <>
        {result.content.length ? null : <Body>No saved shopping sheets on this date.</Body>}
        {result.content.map(sheet => <Action key={sheet.id}
          title={`${sheetStatusLabels[sheet.status]} sheet · ${sheet.lines.length} items · saved ${sheet.createdAt}`}
          secondary disabled={mutation.busy} onPress={() => openSheet(sheet)} />)}
        <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setSheetPage} />
      </>}</QueryResult>
    </Card>}
    <ConfirmDialog visible={pending !== null} title="Confirm actual purchase"
      message={pending ? `Record ${pending.lines.length} items purchased on ${pending.purchaseDate}. This creates a purchase obligation.` : ""}
      confirmLabel="Confirm purchased goods" onCancel={() => setPending(null)} onConfirm={() => {
        const body = pending;
        setPending(null);
        if (body) void mutation.run(() => getOperationsApi().confirmPurchase(body, requests.key("confirm-purchase", body)), result => {
          requests.complete("confirm-purchase", body);
          onPurchase(result.purchase.id);
        });
      }} />
  </>;
}

function CatalogItemForm({ item, requests, onBack, onSaved }: {
  item: ShoppingItem | null;
  requests: FinancialRequestKeys;
  onBack(): void;
  onSaved(): void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.defaultUnit ?? "");
  const [quantity, setQuantity] = useState(item?.defaultQuantity ?? "");
  const [suggestionEnabled, setSuggestionEnabled] = useState(item?.suggestionEnabled ?? true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation();
  function save() {
    setError(null);
    try {
      if (!name.trim() || !unit.trim()) throw new Error("Enter the item name and default unit.");
      if (item && !reason.trim()) throw new Error("Enter a reason for updating the catalog item.");
      const body = { name: name.trim(), defaultUnit: unit.trim(), defaultQuantity: quantity.trim() ? purchaseQuantity(quantity.trim()) : null,
        suggestionEnabled, supplierId: item?.supplierId, reason: item ? reason.trim() : undefined };
      const operation = `catalog-item:${item?.id ?? "new"}`;
      const key = requests.key(operation, body);
      void mutation.run(() => item ? getOperationsApi().updateShoppingItem(item.id, body, key)
        : getOperationsApi().createShoppingItem(body, key), () => { requests.complete(operation, body); onSaved(); });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check the shopping item fields.");
    }
  }
  return <Card title={item ? `Edit shopping item · ${item.name}` : "Add shopping item"}>
    <FormField label="Item name" value={name} onChangeText={setName} maxLength={150} editable={!mutation.busy} />
    <FormField label="Default unit" value={unit} onChangeText={setUnit} maxLength={30} editable={!mutation.busy} />
    <FormField label="Default quantity (optional)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" editable={!mutation.busy} />
    <FormToggle label="Enable automatic suggestions" value={suggestionEnabled} onChange={setSuggestionEnabled} disabled={mutation.busy} />
    <Body>Automatic suggestions use the actual last purchase date.</Body>
    {item ? <FormField label="Catalog correction reason" value={reason} onChangeText={setReason} maxLength={1000} editable={!mutation.busy} /> : null}
    <MutationFeedback {...mutation} error={error ?? mutation.error} />
    <Action title="Save shopping item" disabled={mutation.busy} onPress={save} />
    <Action title="Back to shopping list" secondary disabled={mutation.busy} onPress={onBack} />
  </Card>;
}
