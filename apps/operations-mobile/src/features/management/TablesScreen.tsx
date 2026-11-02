import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Share, useWindowDimensions, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { DiningTableResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { readEmbeddedTenant } from "../../tenant";
import { FormStatus, Toggle } from "./controls";
import { createGuestQrUrl, requiredText } from "./validation";
import { purgeStaleQrExports, releaseQrExport } from "./qrExportCache";

type PendingAction = { kind: "common" } | { kind: "rotate" | "deactivate"; table: DiningTableResponse };
type EphemeralQr = { label: string; value: string };
type QrImage = { toDataURL(callback: (base64: string) => void): void };

/** Tokens live only in this mounted screen and are discarded on background or role revocation. */
export function TablesScreen() {
  const tenant = readEmbeddedTenant();
  const { width } = useWindowDimensions();
  const qrSize = Math.max(100, Math.min(240, width - 124));
  const query = useApiQuery(signal => getOperationsApi().listTables({ signal }), "managed-tables");
  const mutation = useApiMutation();
  const [search, setSearch] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState<DiningTableResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [qr, setQr] = useState<EphemeralQr | null>(null);
  const qrRef = useRef<QrImage | null>(null);
  const activeRef = useRef(AppState.currentState === "active");
  const focusedRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const sharingRef = useRef(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    setSharingBusy(sharingRef.current);
    return () => {
      focusedRef.current = false; generationRef.current++;
      setQr(null); setPending(null); qrRef.current = null;
    };
  }, []));
  useEffect(() => {
    mountedRef.current = true;
    void purgeStaleQrExports().catch(() => undefined);
    const subscription = AppState.addEventListener("change", next => {
      activeRef.current = next === "active";
      if (next !== "active") { generationRef.current++; setQr(null); setPending(null); qrRef.current = null; }
    });
    return () => { mountedRef.current = false; activeRef.current = false; generationRef.current++; qrRef.current = null; subscription.remove(); };
  }, []);

  function isCurrent(generation: number) {
    return mountedRef.current && activeRef.current && focusedRef.current && generationRef.current === generation;
  }
  function displayQr(token: string, label: string, kind: "common" | "table", generation: number) {
    if (!tenant.guestBaseUrl || !isCurrent(generation)) return;
    setQr({ label, value: createGuestQrUrl(tenant.guestBaseUrl, tenant.restaurantId, token, kind) });
  }
  function saveTable() {
    const generation = generationRef.current;
    setFormError(null);
    try {
      const body = { tableNumber: requiredText(tableNumber, 30, "Table number"), active };
      if (editing) {
        void mutation.run(() => getOperationsApi().updateTable(editing.id, body), () => { setEditing(null); setTableNumber(""); setActive(true); query.reload(); });
      } else {
        if (!tenant.guestBaseUrl) throw new Error("Configure the approved guest website origin before creating a table and its one-time QR code.");
        void mutation.run(() => getOperationsApi().createTable(body), created => { displayQr(created.qrToken, `Table ${created.tableNumber}`, "table", generation); if (isCurrent(generation)) { setTableNumber(""); setActive(true); query.reload(); } });
      }
    } catch (error) { setFormError(error instanceof Error ? error.message : "Check the table fields."); }
  }
  function confirmAction() {
    const generation = generationRef.current;
    const action = pending; setPending(null); setQr(null); setFormError(null);
    if (!action) return;
    if (action.kind === "common") void mutation.run(() => getOperationsApi().rotateCommonQrToken(), result => displayQr(result.commonQrToken, "Common pickup QR", "common", generation));
    else if (action.kind === "rotate") void mutation.run(() => getOperationsApi().rotateTableQrToken(action.table.id), result => displayQr(result.qrToken, `Table ${result.tableNumber}`, "table", generation));
    else void mutation.run(() => getOperationsApi().updateTable(action.table.id, { tableNumber: action.table.tableNumber, active: false }), query.reload);
  }
  async function shareLink() {
    const generation = generationRef.current;
    if (!qr || sharingRef.current || !isCurrent(generation)) return;
    sharingRef.current = true;
    setSharingBusy(true); setFormError(null);
    try { await Share.share({ title: qr.label, message: `${qr.label}\n${qr.value}` }); }
    catch { if (isCurrent(generation)) setFormError("The QR link could not be shared. Try again while the code is visible."); }
    finally { sharingRef.current = false; if (mountedRef.current && focusedRef.current) setSharingBusy(false); }
  }
  async function exportImage() {
    const source = qrRef.current;
    const generation = generationRef.current;
    if (!source || !qr || sharingRef.current || !isCurrent(generation)) return;
    sharingRef.current = true;
    setSharingBusy(true); setFormError(null);
    let path: string | null = null;
    let shared = false;
    try {
      if (!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) throw new Error("Unavailable");
      if (!isCurrent(generation)) return;
      const base64 = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("QR export timed out")), 10000);
        source.toDataURL(value => { clearTimeout(timeout); resolve(value); });
      });
      if (!isCurrent(generation)) return;
      path = `${FileSystem.cacheDirectory}restaurant-qr-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (isCurrent(generation)) { await Sharing.shareAsync(path, { mimeType: "image/png", dialogTitle: "Save or share restaurant QR", UTI: "public.png" }); shared = true; }
    } catch { if (isCurrent(generation)) setFormError("QR image export is unavailable. Share the QR link or retry on an Android development build."); }
    finally {
      if (path) await releaseQrExport(path, shared);
      sharingRef.current = false;
      if (mountedRef.current && focusedRef.current) setSharingBusy(false);
    }
  }
  return <Page title="Tables & QR" subtitle="Dining tables and guest ordering codes" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Card title="QR access">
      <Body>QR credentials allow guests to place orders. Share codes only with intended restaurant guests. Codes are shown once after creation or rotation and cleared when leaving this screen or putting the app in the background.</Body>
      <Body>Existing printed QR codes remain compatible. Existing secrets cannot be fetched from the API; keep a secure copy of the printed code. Rotate only when you intend to replace it.</Body>
      {!tenant.guestBaseUrl ? <Body>QR generation unavailable: this Android build has no approved guest website origin. Existing table names and availability can still be updated.</Body> : null}
      <Action title="Rotate Common QR" secondary disabled={mutation.busy || !tenant.guestBaseUrl} onPress={() => setPending({ kind: "common" })} />
    </Card>
    {qr ? <Card title={qr.label}>
      <View accessible accessibilityLabel={`${qr.label}, sensitive ordering code`} style={{ alignItems: "center", padding: 8, backgroundColor: "#fff" }}>
        <QRCode value={qr.value} size={qrSize} quietZone={16} getRef={(value: QrImage | null) => { qrRef.current = value; }} />
      </View>
      <Body>Save or share this code now. The server will not return its credential again.</Body>
      <Action title="Share QR link" onPress={() => { void shareLink(); }} disabled={sharingBusy} />
      <Action title="Export QR image" secondary onPress={() => { void exportImage(); }} disabled={sharingBusy} />
      <Action title="Clear QR from screen" secondary onPress={() => { setQr(null); qrRef.current = null; }} disabled={sharingBusy} />
    </Card> : null}
    <FormStatus error={formError ?? mutation.error} message={mutation.message} />
    <Card title={editing ? `Edit table ${editing.tableNumber}` : "Create table"}>
      <FormField label="Table number or name" value={tableNumber} onChangeText={setTableNumber} maxLength={30} editable={!mutation.busy} />
      <Toggle label="Table active" value={active} onChange={setActive} disabled={mutation.busy} />
      <Action title={mutation.busy ? "Saving…" : editing ? "Save table" : "Create table and QR"} disabled={mutation.busy || !editing && !tenant.guestBaseUrl} onPress={saveTable} />
      {editing ? <Action title="Cancel table edit" secondary disabled={mutation.busy} onPress={() => { setEditing(null); setTableNumber(""); setActive(true); }} /> : null}
    </Card>
    <FormField label="Search tables" value={search} onChangeText={setSearch} />
    <QueryResult {...query}>{tables => {
      const filtered = tables.filter(table => table.tableNumber.toLowerCase().includes(search.trim().toLowerCase()));
      return <>{filtered.length ? filtered.map(table => <Card key={table.id} title={`Table ${table.tableNumber}`}>
        <Body>{table.active ? "Active" : "Inactive"}</Body>
        <Action title="Edit table" secondary disabled={mutation.busy} onPress={() => { setEditing(table); setTableNumber(table.tableNumber); setActive(table.active); }} />
        <Action title="Rotate table QR" secondary disabled={mutation.busy || !tenant.guestBaseUrl} onPress={() => setPending({ kind: "rotate", table })} />
        {table.active ? <Action title="Deactivate table" secondary disabled={mutation.busy} onPress={() => setPending({ kind: "deactivate", table })} /> : null}
      </Card>) : <Card><Body>{tables.length ? "No tables match this search." : "No tables yet. Create a table to generate its first QR code."}</Body></Card>}</>;
    }}</QueryResult>
    <ConfirmDialog visible={pending !== null} title={pending?.kind === "deactivate" ? "Deactivate table?" : "Rotate QR credential?"}
      message={pending?.kind === "deactivate" ? "New orders from this table QR will be blocked. Existing orders and historical records remain." : "Rotating this credential invalidates previously printed QR codes. Save or share the replacement and reprint the affected code. The new credential is returned only once."}
      confirmLabel={pending?.kind === "deactivate" ? "Deactivate table" : "Rotate and show replacement QR"} onCancel={() => setPending(null)} onConfirm={confirmAction} />
  </Page>;
}
