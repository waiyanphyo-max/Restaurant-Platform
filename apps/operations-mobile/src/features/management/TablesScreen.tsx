import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Share, useWindowDimensions, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { DiningTableRequest, DiningTableResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page, StateView, Status } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { readEmbeddedTenant } from "../../tenant";
import { FormStatus, Toggle } from "./controls";
import { createGuestQrUrl, requiredText } from "./validation";
import { purgeStaleQrExports, releaseQrExport } from "./qrExportCache";

type PendingAction = { kind: "common" } | { kind: "rotate" | "deactivate"; table: DiningTableResponse } | { kind: "edit"; table: DiningTableResponse; body: DiningTableRequest } | { kind: "discard" };
type EphemeralQr = { label: string; value: string };
type QrImage = { toDataURL(callback: (base64: string) => void): void };

/** Tokens live only in this mounted screen and are discarded on background or role revocation. */
export function TablesScreen() {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || !["OWNER", "MANAGER"].includes(state.membership.role)) return <Page title="Tables & QR"><StateView kind="forbidden" message="Only the restaurant Owner or Manager can manage tables and QR credentials." /></Page>;
  return <ManagedTables key={`${state.userId}:${state.membership.restaurantId}:${state.membership.role}`} />;
}

function ManagedTables() {
  const { state, assertWorkspaceAccess } = useOperationsAuth();
  const tenant = readEmbeddedTenant();
  const { width } = useWindowDimensions();
  const qrSize = Math.max(100, Math.min(240, width - 124));
  const query = useApiQuery(signal => getOperationsApi().listTables({ signal }), "managed-tables", { keepPreviousData: true });
  const mutation = useApiMutation();
  const [search, setSearch] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState<DiningTableResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [qr, setQr] = useState<EphemeralQr | null>(null);
  const [writeBlocked, setWriteBlocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const qrRef = useRef<QrImage | null>(null);
  const activeRef = useRef(AppState.currentState === "active");
  const focusedRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const sharingRef = useRef(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const dirty = editing ? tableNumber !== editing.tableNumber || active !== editing.active : !!tableNumber.trim() || !active;
  const latestTable = editing && query.state.status === "ready" ? query.state.data.find(table => table.id === editing.id) : null;
  const changedRemotely = !!editing && query.state.status === "ready" && (!latestTable || latestTable.tableNumber !== editing.tableNumber || latestTable.active !== editing.active);
  useUnsavedChanges(dirty);
  const api = () => {
    if (state.status !== "ready") throw new Error("Workspace access is unavailable");
    const { userId, membership: { role } } = state;
    return getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) });
  };
  const writeFailure = (failure: unknown) => {
    if (!(failure instanceof ApiHttpError && failure.status >= 400 && failure.status < 500 && failure.status !== 408)) { setWriteBlocked(true); setUncertain(true); }
  };
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
    setFormError(null); setFeedback(null);
    try {
      if (mutation.busy || writeBlocked || changedRemotely) return;
      const body = { tableNumber: requiredText(tableNumber, 30, "Table number"), active };
      if (editing) {
        setPending({ kind: "edit", table: editing, body });
      } else {
        if (!tenant.guestBaseUrl) throw new Error("Configure the approved guest website origin before creating a table and its one-time QR code.");
        void mutation.run(() => api().createTable(body), created => { displayQr(created.qrToken, `Table ${created.tableNumber}`, "table", generation); if (isCurrent(generation)) { setTableNumber(""); setActive(true); setFeedback("Table created by the server. Save the one-time QR now."); query.reload(); } }, writeFailure);
      }
    } catch (error) { setFormError(error instanceof Error ? error.message : "Check the table fields."); }
  }
  function confirmAction() {
    const generation = generationRef.current;
    const action = pending; setPending(null); setQr(null); setFormError(null); setFeedback(null);
    if (!action) return;
    if (action.kind === "discard") { setEditing(null); setTableNumber(""); setActive(true); setFeedback("Table draft discarded."); return; }
    if (mutation.busy || writeBlocked || action.kind === "edit" && changedRemotely) return;
    if (action.kind === "deactivate" && query.state.status === "ready") {
      const latest = query.state.data.find(table => table.id === action.table.id);
      if (!latest || latest.tableNumber !== action.table.tableNumber || latest.active !== action.table.active) {
        setFormError("This table changed while the confirmation was open. Review its current name and availability before another action."); return;
      }
    }
    if (action.kind === "common") void mutation.run(() => api().rotateCommonQrToken(), result => {
      displayQr(result.commonQrToken, "Common pickup QR", "common", generation);
      setFeedback(isCurrent(generation) ? "Common QR replaced by the server. Previous printed codes are invalid." : "QR rotation was confirmed, but its one-time display was cleared after leaving or backgrounding. The credential cannot be read again. Review before intentionally creating another replacement.");
    }, writeFailure);
    else if (action.kind === "rotate") void mutation.run(() => api().rotateTableQrToken(action.table.id), result => {
      displayQr(result.qrToken, `Table ${result.tableNumber}`, "table", generation);
      setFeedback(isCurrent(generation) ? "Table QR replaced by the server. Previous printed codes are invalid." : "QR rotation was confirmed, but its one-time display was cleared after leaving or backgrounding. The credential cannot be read again. Review before intentionally creating another replacement.");
    }, writeFailure);
    else void mutation.run(() => api().updateTable(action.table.id, action.kind === "edit" ? action.body : { tableNumber: action.table.tableNumber, active: false }), () => {
      setEditing(null); setTableNumber(""); setActive(true); setFeedback("Table changes saved by the server. Historical orders and payments remain."); query.reload();
    }, writeFailure);
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
      <Action title="Rotate Common QR" secondary danger disabled={mutation.busy || writeBlocked || !tenant.guestBaseUrl} onPress={() => setPending({ kind: "common" })} />
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
    {uncertain ? <Status tone="warning">A table or QR write could not be confirmed. Its credential may already have changed and cannot be recovered by reading. Check current tables before reviewing another action. A further rotation creates a new replacement and invalidates any previous printout. ရလဒ်ကို အတည်မပြုနိုင်ပါ။ ပြန်လည်စစ်ဆေးပါ။</Status> : null}
    {writeBlocked ? <Action title="Check tables after uncertain action" secondary disabled={mutation.busy} onPress={() => {
      void mutation.run(() => api().listTables(), () => { setWriteBlocked(false); setPending(null); query.reload(); setFeedback("Current tables checked. Review the list before creating another table or intentionally rotating a replacement; the earlier QR outcome is still unknown."); });
    }} /> : null}
    <FormStatus error={formError ?? mutation.error} message={feedback} />
    <Card title={editing ? `Edit table ${editing.tableNumber}` : "Create table"}>
      <FormField label="Table number or name" value={tableNumber} onChangeText={setTableNumber} maxLength={30} editable={!mutation.busy} />
      <Toggle label="Table active" value={active} onChange={setActive} disabled={mutation.busy} />
      {dirty ? <Status tone="warning">Unsaved table changes.</Status> : null}
      {changedRemotely ? <Status tone="warning">This table changed on the server. Your draft is preserved. Cancel this edit and reopen the current table before saving.</Status> : null}
      <Action title={mutation.busy ? "Saving…" : editing ? "Save table" : "Create table and QR"} disabled={mutation.busy || writeBlocked || changedRemotely || !editing && !tenant.guestBaseUrl} onPress={saveTable} />
      {dirty || editing ? <Action title="Cancel table edit" secondary disabled={mutation.busy || writeBlocked} onPress={() => dirty ? setPending({ kind: "discard" }) : (setEditing(null), setTableNumber(""), setActive(true))} /> : null}
    </Card>
    <FormField label="Search tables" value={search} onChangeText={setSearch} />
    <QueryResult {...query}>{tables => {
      const filtered = tables.filter(table => table.tableNumber.toLowerCase().includes(search.trim().toLowerCase()));
      return <>{filtered.length ? filtered.map(table => <Card key={table.id} title={`Table ${table.tableNumber}`}>
        <Body>{table.active ? "Active" : "Inactive"}</Body>
        <Action title="Edit table" secondary disabled={mutation.busy || dirty} onPress={() => { setEditing(table); setTableNumber(table.tableNumber); setActive(table.active); }} />
        <Action title="Rotate table QR" secondary disabled={mutation.busy || writeBlocked || !tenant.guestBaseUrl} onPress={() => setPending({ kind: "rotate", table })} />
        {table.active ? <Action title="Deactivate table" secondary danger disabled={mutation.busy || writeBlocked} onPress={() => setPending({ kind: "deactivate", table })} /> : null}
      </Card>) : <Card><Body>{tables.length ? "No tables match this search." : "No tables yet. Create a table to generate its first QR code."}</Body></Card>}</>;
    }}</QueryResult>
    <ConfirmDialog visible={pending !== null} title={pending?.kind === "discard" ? "Discard table changes?" : pending?.kind === "edit" ? "Save table changes?" : pending?.kind === "deactivate" ? "Deactivate table?" : "Rotate QR credential?"}
      message={pending?.kind === "discard" ? "Your unsaved table draft will be removed. The published table stays unchanged." : pending?.kind === "edit" ? `Table: ${pending.table.tableNumber} → ${pending.body.tableNumber}\nAvailability: ${pending.table.active ? "Active" : "Inactive"} → ${pending.body.active ? "Active" : "Inactive"}\n${pending.body.active ? "New orders may use this table." : "New orders from this table QR will be blocked."} Existing orders and payments remain; this update keeps its QR credential.` : pending?.kind === "deactivate" ? "New orders from this table QR will be blocked. Existing orders and historical records remain." : `${uncertain ? "The previous QR outcome is unknown. This is an intentional new replacement.\n" : ""}Rotating this credential invalidates previously printed QR codes. Save or share the replacement and reprint the affected code. The new credential is returned only once. Historical orders and payments remain.`}
      danger={pending?.kind !== "edit" || !pending.body.active} confirmDisabled={mutation.busy || writeBlocked || pending?.kind === "edit" && changedRemotely} confirmLabel={pending?.kind === "discard" ? "Discard changes" : pending?.kind === "edit" ? "Confirm table update" : pending?.kind === "deactivate" ? "Deactivate table" : "Rotate and show replacement QR"} onCancel={() => setPending(null)} onConfirm={confirmAction} />
  </Page>;
}
