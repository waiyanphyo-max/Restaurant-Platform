import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ShoppingItem, ShoppingItemSort, ShoppingSheet } from "@restaurant-platform/shared-types";
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
import { procurementToday } from "./procurement-format";
import { copyShoppingLines, validateShoppingLines, type PlanningDraftLine } from "./shopping-plan";

const pageSize = 20;
const catalogSortLabels = { NAME_ASC: "Name A–Z", NAME_DESC: "Name Z–A", LAST_PURCHASE_DESC: "Last purchased" } as const;

export function ShoppingScreen() {
  const [workspace, setWorkspace] = useState<"SHEETS" | "CATALOG">("SHEETS");
  const [requests] = useState(() => new FinancialRequestKeys());
  const settings = useApiQuery(signal => getOperationsApi().getSettings({ signal }), "shopping-settings");
  return <Page title="Shopping" subtitle="Shopping Item Catalog · Daily Shopping Sheets">
    <Choices label="Shopping workspace" value={workspace} values={["SHEETS", "CATALOG"]}
      labels={{ SHEETS: "Daily Shopping Sheets", CATALOG: "Shopping Item Catalog" }} onChange={setWorkspace} />
    {workspace === "CATALOG" ? <ShoppingCatalog requests={requests} /> : null}
    <View style={workspace === "SHEETS" ? undefined : styles.hidden}>
      <QueryResult {...settings}>{value => <DailyShoppingPlanner timezone={value.timezone} requests={requests} />}</QueryResult>
    </View>
  </Page>;
}

export function DailyShoppingPlanner({ timezone, requests }: { timezone: string; requests: FinancialRequestKeys }) {
  const today = procurementToday(timezone);
  const [date, setDate] = useState(today);
  const [historyDate, setHistoryDate] = useState(today);
  const [page, setPage] = useState(0);
  const [lines, setLines] = useState<PlanningDraftLine[]>([]);
  const [saved, setSaved] = useState<ShoppingSheet | null>(null);
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ label: string; run(): void } | null>(null);
  const mutation = useApiMutation();
  const selectedDate = isIsoDate(historyDate) ? historyDate : today;
  const sheets = useApiQuery(signal => getOperationsApi().listShoppingSheets({ from: selectedDate, to: selectedDate, page, size: pageSize }, { signal }),
    JSON.stringify(["shopping-sheets", selectedDate, page]));
  const locked = saved !== null && saved.status !== "PLANNED";

  function changeLines(next: PlanningDraftLine[]) { setLines(next); setDirty(true); }
  function replaceDraft(label: string, run: () => void) {
    if (dirty) setPending({ label, run }); else run();
  }
  function load(sheet: ShoppingSheet, copy: boolean) {
    replaceDraft(copy ? "Copy previous sheet" : "Open previous sheet", () => {
      setSaved(copy ? null : sheet); setDate(copy ? today : sheet.shoppingDate);
      setLines(copyShoppingLines(sheet.lines)); setReason(""); setError(null); setDirty(copy); mutation.reset();
    });
  }
  function save() {
    setError(null);
    try {
      if (!isIsoDate(date)) throw new Error("Enter a valid shopping date.");
      if (saved && !reason.trim()) throw new Error("Enter a reason for changing the saved plan.");
      const body = { shoppingDate: date, lines: validateShoppingLines(lines), reason: saved ? reason.trim() : undefined };
      const operation = `shopping-plan:${saved?.id ?? "new"}`;
      void mutation.run(() => saved ? getOperationsApi().updateShoppingSheet(saved.id, body, requests.key(operation, body))
        : getOperationsApi().createShoppingSheet(body, requests.key(operation, body)), value => {
        requests.complete(operation, body); setSaved(value); setReason(""); setDirty(false);
        setHistoryDate(value.shoppingDate); sheets.reload();
      });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the shopping sheet."); }
  }
  return <>
    <Card title={`Daily Shopping — ${date}`}>
      <FormField label="Shopping date (YYYY-MM-DD)" value={date} maxLength={10} editable={!mutation.busy && !locked}
        onChangeText={value => { setDate(value); setDirty(true); }} />
      <Body>{lines.length} items{dirty ? " · Unsaved changes" : ""}</Body>
      {locked ? <Body>This historical sheet is locked. Copy it to make an independent new plan.</Body> : null}
      <View style={styles.row}><Text style={[styles.item, styles.heading]}>Item</Text><Text style={[styles.quantity, styles.heading]}>Qty</Text><Text style={[styles.unit, styles.heading]}>Unit</Text><View style={styles.remove} /></View>
      {lines.length ? null : <Body>No items selected. Add only what you need for this date.</Body>}
      {lines.map((line, index) => <View key={`${line.itemId}:${index}`} style={styles.row}>
        <Text style={styles.item}>{line.name}</Text>
        <TextInput accessibilityLabel={`Quantity for ${line.name}`} style={styles.quantity} value={line.quantity}
          keyboardType="decimal-pad" editable={!mutation.busy && !locked} selectTextOnFocus
          onChangeText={quantity => changeLines(lines.map((value, row) => row === index ? { ...value, quantity } : value))} />
        <TextInput accessibilityLabel={`Unit for ${line.name}`} style={styles.unit} value={line.unit} maxLength={30}
          editable={!mutation.busy && !locked} onChangeText={unit => changeLines(lines.map((value, row) => row === index ? { ...value, unit } : value))} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.name}`} style={styles.remove}
          disabled={mutation.busy || locked} onPress={() => changeLines(lines.filter((_, row) => row !== index))}><Text>×</Text></Pressable>
      </View>)}
      {locked ? null : <>
        <Action title="Add Item" secondary disabled={mutation.busy} onPress={() => setShowCatalog(!showCatalog)} />
        {showCatalog ? <ShoppingCatalog requests={requests} selected={lines.map(line => line.itemId)} onSelect={item => {
          if (!mutation.busy && !lines.some(line => line.itemId === item.id)) changeLines([...lines, { itemId: item.id, name: item.name, quantity: "", unit: item.defaultUnit ?? "" }]);
        }} /> : null}
        {saved ? <FormField label="Plan correction reason" value={reason} onChangeText={setReason} maxLength={1000} editable={!mutation.busy} /> : null}
        <Action title="Save Shopping Sheet" disabled={mutation.busy || !lines.length} onPress={save} />
      </>}
      <MutationFeedback {...mutation} error={error ?? mutation.error} />
      <Action title="Start an empty sheet" secondary disabled={mutation.busy} onPress={() => replaceDraft("Start an empty sheet", () => {
        setSaved(null); setLines([]); setDate(today); setReason(""); setError(null); setDirty(false); mutation.reset();
      })} />
    </Card>
    <Card title="Open or Copy Previous Sheet">
      <FormField label="Saved sheet date (YYYY-MM-DD)" value={historyDate} maxLength={10} editable={!mutation.busy}
        onChangeText={value => { setHistoryDate(value); setPage(0); }} />
      <Action title="Refresh saved sheets" secondary disabled={mutation.busy} onPress={sheets.reload} />
      <QueryResult {...sheets}>{result => <>
        {result.content.length ? null : <Body>No saved sheets on this date.</Body>}
        {result.content.map(sheet => <View key={sheet.id}>
          <Body>{sheet.shoppingDate} · {sheet.lines.length} items · {sheet.createdAt}</Body>
          <Action title="Open Previous Sheet" secondary disabled={mutation.busy} onPress={() => load(sheet, false)} />
          <Action title="Copy Previous Sheet" secondary disabled={mutation.busy} onPress={() => load(sheet, true)} />
        </View>)}
        <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setPage} />
      </>}</QueryResult>
    </Card>
    <ConfirmDialog visible={pending !== null} title={pending?.label ?? "Replace draft"} message="Discard your unsaved changes and continue?"
      confirmLabel="Discard changes and continue" onCancel={() => setPending(null)} onConfirm={() => { const action = pending; setPending(null); action?.run(); }} />
  </>;
}

/** Shared reference-data picker contains no prices or financial actions. */
export function ShoppingCatalog({ requests, selected = [], onSelect }: {
  requests: FinancialRequestKeys; selected?: string[]; onSelect?(item: ShoppingItem): void;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<ShoppingItemSort>("NAME_ASC");
  const [suggestions, setSuggestions] = useState(false);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<{ item: ShoppingItem | null } | null>(null);
  const catalog = useApiQuery(signal => getOperationsApi().listShoppingItems({ search: term, suggestionsOnly: suggestions, sort, page, size: pageSize }, { signal }),
    JSON.stringify(["shopping-items", term, suggestions, sort, page]));
  if (form) return <CatalogItemForm item={form.item} requests={requests} onBack={() => setForm(null)} onSaved={() => { setForm(null); catalog.reload(); }} />;
  function find() { setTerm(search.trim()); setPage(0); }
  return <Card title="Shopping Item Catalog">
    <FormField label="Find a shopping item by name" value={search} onChangeText={setSearch} maxLength={150} returnKeyType="search" onSubmitEditing={find} />
    <Action title="Search catalog" secondary onPress={find} />
    <FormToggle label="Suggested items only" value={suggestions} onChange={value => { setSuggestions(value); setPage(0); }} />
    <Choices label="Sort shopping items" value={sort} values={["NAME_ASC", "NAME_DESC", "LAST_PURCHASE_DESC"]} labels={catalogSortLabels} onChange={value => { setSort(value); setPage(0); }} />
    <Action title="Create catalog item" secondary onPress={() => setForm({ item: null })} />
    <QueryResult {...catalog}>{result => <>
      {result.content.length ? null : <Body>No matching items. Search all items or create an item.</Body>}
      {result.content.map(item => <View key={item.id} style={styles.catalogRow}>
        <Text style={styles.item}>{item.name}{item.defaultUnit ? ` · ${item.defaultUnit}` : ""}</Text>
        {onSelect ? <Action title={selected.includes(item.id) ? `${item.name} added` : `Add ${item.name}`} disabled={selected.includes(item.id)} onPress={() => onSelect(item)} /> : null}
        <Action title={`Edit ${item.name}`} secondary onPress={() => setForm({ item })} />
      </View>)}
      <FinancialPagination page={result.page} totalPages={Math.ceil(result.totalElements / result.size)} onPageChange={setPage} />
    </>}</QueryResult>
  </Card>;
}

function CatalogItemForm({ item, requests, onBack, onSaved }: { item: ShoppingItem | null; requests: FinancialRequestKeys; onBack(): void; onSaved(): void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.defaultUnit ?? "");
  const [reason, setReason] = useState("");
  const [suggestionEnabled, setSuggestionEnabled] = useState(item?.suggestionEnabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation();
  function save() {
    setError(null);
    if (!name.trim() || (item && !reason.trim())) { setError("Enter an item name and a correction reason when editing."); return; }
    // Retain legacy metadata; daily quantities never use the catalog quantity.
    const body = { name: name.trim(), defaultUnit: unit.trim() || null, defaultQuantity: item?.defaultQuantity ?? null,
      supplierId: item?.supplierId ?? null, suggestionEnabled, reason: item ? reason.trim() : undefined };
    const operation = `shopping-item:${item?.id ?? "new"}`;
    void mutation.run(() => item ? getOperationsApi().updateShoppingItem(item.id, body, requests.key(operation, body))
      : getOperationsApi().createShoppingItem(body, requests.key(operation, body)), () => { requests.complete(operation, body); onSaved(); });
  }
  return <Card title={item ? "Edit catalog item" : "Create catalog item"}>
    <FormField label="Item name" value={name} onChangeText={setName} maxLength={150} editable={!mutation.busy} />
    <FormField label="Default unit (optional)" value={unit} onChangeText={setUnit} maxLength={30} editable={!mutation.busy} />
    <FormToggle label="Enable suggestions" value={suggestionEnabled} onChange={setSuggestionEnabled} disabled={mutation.busy} />
    {item ? <FormField label="Catalog correction reason" value={reason} onChangeText={setReason} maxLength={1000} editable={!mutation.busy} /> : null}
    <MutationFeedback {...mutation} error={error ?? mutation.error} />
    <Action title="Save shopping item" disabled={mutation.busy} onPress={save} />
    <Action title="Back to catalog" secondary disabled={mutation.busy} onPress={onBack} />
  </Card>;
}

const styles = StyleSheet.create({
  hidden: { display: "none" }, row: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: "#cbd5e1", gap: 6, paddingVertical: 4 },
  item: { flex: 1, minWidth: 60, color: "#18222e", fontSize: 15 }, heading: { fontWeight: "700" },
  quantity: { width: 70, minHeight: 48, padding: 6, color: "#18222e", backgroundColor: "#f8fafc" },
  unit: { width: 74, minHeight: 48, padding: 6, color: "#18222e", backgroundColor: "#f8fafc" },
  remove: { width: 44, minHeight: 48, justifyContent: "center", alignItems: "center" }, catalogRow: { gap: 6, borderBottomWidth: 1, borderColor: "#e2e8f0", paddingVertical: 8 }
});
