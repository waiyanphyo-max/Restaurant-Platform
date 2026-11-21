import { useRef, useState } from "react";
import type { DeliveryZoneRequest, DeliveryZoneResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { LocationSelector } from "../../components/LocationSelector";
import { QueryResult } from "../../components/QueryResult";
import { Action, Badge, Body, Card, ConfirmDialog, FormField, Status } from "../../components/ui";
import { FormToggle, MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormValidationError } from "../../hooks/mutation";
import { useDraftNavigation, useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { operationalAmount } from "./format";
import { confirmedZone, createZoneDraft, zoneRequest, zoneSnapshot } from "./delivery-configuration";

export function DeliveryConfiguration() {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || !["OWNER", "MANAGER"].includes(state.membership.role)) return null;
  return <ConfigurationWorkspace key={`${state.userId}:${state.membership.restaurantId}:${state.membership.role}`} restaurantId={state.membership.restaurantId} />;
}

function useConfigurationApi() {
  const { state, assertWorkspaceAccess } = useOperationsAuth();
  const userId = state.status === "ready" ? state.userId : "";
  const role = state.status === "ready" ? state.membership.role : "STAFF";
  return () => getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) });
}

function ConfigurationWorkspace({ restaurantId }: { restaurantId: string }) {
  const configurationApi = useConfigurationApi();
  const [open, setOpen] = useState(false);
  const { requestNavigation } = useDraftNavigation();
  const query = useApiQuery(async signal => {
    if (!open) return null;
    const api = configurationApi();
    const [zones, members, defaultDriver] = await Promise.all([api.listDeliveryZones({ signal }), api.listDeliveryAssignmentOptions({ signal }), api.getDefaultDriver({ signal })]);
    if (zones.some(zone => zone.restaurantId !== restaurantId) || defaultDriver.restaurantId !== restaurantId) throw new FormValidationError("Delivery configuration did not match the installed restaurant.");
    return { zones, drivers: members.filter(member => member.role === "DELIVERY_DRIVER"), defaultDriver };
  }, `delivery-config:${open}`, { keepPreviousData: true });
  const mutation = useApiMutation();
  const [pendingDriver, setPendingDriver] = useState<{ id: string; name: string; previous: string | null } | null>(null);
  const [driverNeedsReview, setDriverNeedsReview] = useState(false);
  const driverBlocked = useRef(false);
  const [savedDriver, setSavedDriver] = useState<string | null>(null);
  const driverReview = useRef({ current: false, id: null as string | null });
  driverReview.current = { current: query.state.status === "ready" && !query.refreshing && !query.refreshError,
    id: query.state.status === "ready" ? query.state.data?.defaultDriver.defaultDriverUserId ?? null : null };
  return <Card title="Delivery configuration · ပို့ဆောင်မှု သတ်မှတ်ချက်များ">
    <Body>Township coverage is preliminary eligibility. Review the customer's detailed address before accepting a delivery; it does not establish distance or GPS accuracy.</Body>
    <Action title={open ? "Hide configuration" : "Manage coverage, fees and default driver"} secondary onPress={() => requestNavigation(() => setOpen(value => !value))} />
    {open ? <QueryResult {...query}>{data => data ? <>
      {query.refreshError ? <Status tone="warning">The latest configuration could not be loaded. Existing drafts are retained; refresh before saving.</Status> : null}
      <Card title="Default delivery driver">
        <Body>Current default: {data.drivers.find(driver => driver.userId === data.defaultDriver.defaultDriverUserId)?.fullName ?? data.defaultDriver.defaultDriverUserId ?? "Not configured"}</Body>
        <Body>Only an eligible Delivery Driver may be the automatic default. Manual task assignment separately supports other eligible restaurant roles. A change applies to future automatic selection; existing tasks keep their assignments.</Body>
        <MutationFeedback {...mutation} message={savedDriver} />
        {driverNeedsReview ? <><Status tone="warning">The driver update was not confirmed. Reload and review the current default before choosing again.</Status>
          <Action title="Reload default driver for review" secondary disabled={mutation.busy} onPress={() => {
            void mutation.run(async () => {
              const current = await configurationApi().getDefaultDriver();
              if (current.restaurantId !== restaurantId) throw new FormValidationError("Driver data did not match the installed restaurant.");
              return current;
            }, () => {
              mutation.reset();
              driverBlocked.current = false; setDriverNeedsReview(false); setSavedDriver(null); query.reload();
            });
          }} /></> : null}
        {data.drivers.map(driver => <Action key={driver.userId} title={`Set default: ${driver.fullName ?? driver.email ?? driver.userId}`} secondary
          disabled={mutation.busy || driverNeedsReview || query.refreshing || !!query.refreshError || driver.userId === data.defaultDriver.defaultDriverUserId}
          onPress={() => { setSavedDriver(null); setPendingDriver({ id: driver.userId, name: driver.fullName ?? driver.email ?? driver.userId, previous: data.defaultDriver.defaultDriverUserId }); }} />)}
        {!data.drivers.length ? <Body>No eligible Delivery Driver members.</Body> : null}
      </Card>
      <Body>{data.zones.length} delivery zones · Active and inactive coverage</Body>
      {!data.zones.length ? <Body>No delivery zones configured. Create a zone using the active location hierarchy.</Body> : null}
      {data.zones.map(zone => <ZoneEditor key={zone.id} zone={zone} restaurantId={restaurantId} reload={query.reload} current={!query.refreshing && !query.refreshError} />)}
      <ZoneEditor restaurantId={restaurantId} reload={query.reload} current={!query.refreshing && !query.refreshError} />
      <Action title="Refresh delivery configuration" secondary disabled={mutation.busy} onPress={query.reload} />
    </> : null}</QueryResult> : null}
    <ConfirmDialog visible={pendingDriver !== null} title="Change default driver" message={`Use ${pendingDriver?.name ?? "the selected driver"} for future automatic delivery assignments? Existing assignments remain unchanged.`}
      confirmLabel="Set default" onCancel={() => setPendingDriver(null)} onConfirm={() => {
        const pending = pendingDriver; setPendingDriver(null); if (!pending || driverBlocked.current) return;
        if (!driverReview.current.current || driverReview.current.id !== pending.previous) { setDriverNeedsReview(true); driverBlocked.current = true; return; }
        void mutation.run(async () => {
          const api = configurationApi();
          const [members, current] = await Promise.all([api.listDeliveryAssignmentOptions(), api.getDefaultDriver()]);
          if (current.restaurantId !== restaurantId || current.defaultDriverUserId !== pending.previous || !members.some(member => member.userId === pending.id && member.role === "DELIVERY_DRIVER")) {
            throw new FormValidationError("Driver eligibility or the current default changed. Reload and review again.");
          }
          const saved = await api.setDefaultDriver({ driverUserId: pending.id });
          if (saved.restaurantId !== restaurantId || saved.defaultDriverUserId !== pending.id) throw new FormValidationError("The default driver was not confirmed. Reload before another update.");
          return saved;
        }, () => { setSavedDriver(`Server confirmed ${pending.name} as the default for future automatic selection.`); query.reload(); }, () => {
          driverBlocked.current = true; setDriverNeedsReview(true); setSavedDriver(null);
        });
      }} />
  </Card>;
}

export function ZoneEditor({ zone, restaurantId, reload, current = true }: { zone?: DeliveryZoneResponse; restaurantId: string; reload(): void; current?: boolean }) {
  const configurationApi = useConfigurationApi();
  const [baseline, setBaseline] = useState(zone);
  const [draft, setDraft] = useState(() => createZoneDraft(zone));
  const [open, setOpen] = useState(false);
  const [activeSelection, setActiveSelection] = useState(false);
  const [pending, setPending] = useState<{ request: DeliveryZoneRequest; fingerprint: string } | null>(null);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [reconciled, setReconciled] = useState<DeliveryZoneResponse[] | null>(null);
  const blocked = useRef(false);
  const mutation = useApiMutation();
  const dirty = JSON.stringify(draft) !== JSON.stringify(createZoneDraft(baseline));
  useUnsavedChanges(dirty || needsReview);
  const changed = zoneSnapshot(zone) !== zoneSnapshot(baseline);
  const legacy = !!baseline && (!baseline.regionId || !baseline.districtId || !baseline.townshipId);
  const locked = mutation.busy || needsReview || !current;
  const latest = useRef({ current, changed, fingerprint: JSON.stringify(draft) });
  latest.current = { current, changed, fingerprint: JSON.stringify(draft) };
  const update = (patch: Partial<typeof draft>) => { setDraft(value => ({ ...value, ...patch })); setError(null); setNotice(null); };
  function adopt(next?: DeliveryZoneResponse) {
    setBaseline(next); setDraft(createZoneDraft(next)); setActiveSelection(false); setError(null); setPending(null); mutation.reset();
  }
  function review() {
    try {
      if (changed) throw new FormValidationError("The server zone changed. Load the latest zone and review your edits again.");
      const request = zoneRequest(draft, baseline, activeSelection);
      setError(null); setPending({ request, fingerprint: JSON.stringify(draft) });
    } catch (failure) { setError(failure instanceof FormValidationError ? failure.message : "Check the zone fields."); }
  }
  const coverage = (item?: DeliveryZoneResponse) => item ? [item.coverageCity, item.districtName, item.coverageTownship].filter(Boolean).join(" → ") || "Legacy coverage has no location labels" : "No coverage selected";
  return <Card title={baseline ? baseline.name : "New delivery zone"}>
    <Badge tone={baseline?.active ? "success" : "neutral"}>{baseline ? baseline.active ? "Active" : "Inactive" : "Not published"}</Badge>
    <Body>{coverage(baseline)}</Body>
    <Body>Fee {operationalAmount(baseline?.deliveryFee ?? 0)} · Minimum {operationalAmount(baseline?.minimumOrder ?? 0)}</Body>
    {legacy ? <Status tone="warning">Legacy coverage needs explicit review. Original labels: {baseline?.coverageCity ?? "(empty)"} / {baseline?.coverageTownship ?? "(empty)"}. Existing fees and coverage are retained until you confirm an update. No location ID is inferred.</Status> : null}
    <MutationFeedback {...mutation} message={notice} />
    <Action title={open ? "Close zone form" : baseline ? "Edit zone and coverage" : "Create delivery zone"} secondary disabled={mutation.busy || needsReview} onPress={() => {
      if (open && dirty) setDiscard(true); else { if (!open && !dirty) adopt(zone); setOpen(value => !value); }
    }} />
    {open ? <>
      {dirty ? <Status tone="warning">Unsaved zone changes · မသိမ်းရသေးသော ပြောင်းလဲမှုများ</Status> : null}
      {changed ? <Status tone="warning">The server zone changed. Your draft was retained. Load the latest zone before another review.</Status> : null}
      <FormField label="Zone name" value={draft.name} onChangeText={name => update({ name })} maxLength={100} editable={!locked} />
      <FormField label="Delivery fee (whole amount)" value={draft.fee} onChangeText={fee => update({ fee })} keyboardType="number-pad" editable={!locked} />
      <FormField label="Minimum order (whole amount)" value={draft.minimum} onChangeText={minimum => update({ minimum })} keyboardType="number-pad" editable={!locked} />
      {baseline ? <FormToggle label="Replace existing coverage with a reviewed canonical township" value={draft.replaceCoverage} disabled={locked}
        onChange={replaceCoverage => { setActiveSelection(false); update({ replaceCoverage }); }} /> : null}
      {draft.replaceCoverage ? <><Body>Select Region / State → District → Township. Changing a parent clears its descendants. Active reference data must finish loading before review.</Body>
        <LocationSelector value={draft.location} disabled={locked} onValidityChange={setActiveSelection} onChange={location => { setActiveSelection(false); update({ location }); }} />
      </> : <Body>Keep original coverage for this update: {coverage(baseline)}. Saving fees, name or disabling omits coverage fields, preserving original data. Re-enabling requires reviewed canonical coverage.</Body>}
      <FormToggle label="Active zone" value={draft.active} onChange={active => update({ active })} disabled={locked} />
      <Body>Coverage and fee changes affect new Customer checkouts. Existing orders and delivery tasks keep their snapshots.</Body>
      {error ? <Status tone="danger">{error}</Status> : null}
      {needsReview ? <Card title="Reconcile the zone before another save">
        <Body>The save was not confirmed. Do not repeat it until you have checked the current server zones. A missing zone does not prove a previous creation failed.</Body>
        <Action title="Refresh zones to reconcile" secondary disabled={mutation.busy} onPress={() => {
          setReconciled(null);
          void mutation.run(async () => {
            const zones = await configurationApi().listDeliveryZones();
            if (zones.some(item => item.restaurantId !== restaurantId)) throw new FormValidationError("Zone data did not match the installed restaurant.");
            return zones;
          }, zones => { mutation.reset(); setReconciled(zones); reload(); });
        }} />
        {reconciled ? <><Body>Current server zones: {reconciled.map(item => `${item.name} · ${item.active ? "active" : "inactive"} · fee ${operationalAmount(item.deliveryFee)}`).join("; ") || "None returned"}</Body>
          <Action title="I reviewed the zones; load current data" secondary onPress={() => {
            const latest = baseline ? reconciled.find(item => item.id === baseline.id) : undefined;
            if (baseline && !latest) { setError("This zone is no longer available. Return to the refreshed configuration."); return; }
            blocked.current = false; setNeedsReview(false); setReconciled(null); adopt(latest); setNotice("Current server data loaded. Review a new change before saving.");
          }} /></> : null}
      </Card> : <>
        <Action title="Review delivery zone" disabled={locked || !dirty || changed || draft.replaceCoverage && !activeSelection} onPress={review} />
        <Action title="Discard zone changes" secondary disabled={mutation.busy || !dirty && !changed} onPress={() => setDiscard(true)} />
      </>}
    </> : null}
    <ConfirmDialog visible={pending !== null} title="Review delivery zone" message={pending ? `${baseline ? `Current: ${baseline.name} · fee ${operationalAmount(baseline.deliveryFee)} · minimum ${operationalAmount(baseline.minimumOrder)} · ${baseline.active ? "active" : "inactive"}.\n` : "Create a new zone.\n"}Proposed: ${pending.request.name} · fee ${operationalAmount(pending.request.deliveryFee)} · minimum ${operationalAmount(pending.request.minimumOrder)} · ${pending.request.active ? "active" : "inactive"}.\nCoverage: ${pending.request.townshipId ? [draft.location.regionName, draft.location.districtName, draft.location.township].join(" → ") : `Preserve original ${coverage(baseline)}`}.\nThis changes future checkout eligibility and fees; existing order snapshots and assignments remain unchanged.` : ""}
      confirmLabel="Save reviewed zone" onCancel={() => setPending(null)} onConfirm={() => {
        const reviewed = pending; setPending(null); if (!reviewed || blocked.current) return;
        if (!latest.current.current || latest.current.changed || latest.current.fingerprint !== reviewed.fingerprint) {
          setError("The draft or server data changed after review. Review the current zone again."); return;
        }
        const request = reviewed.request;
        void mutation.run(async () => {
          const api = configurationApi();
          if (baseline) {
            const fresh = (await api.listDeliveryZones()).find(item => item.id === baseline.id && item.restaurantId === restaurantId);
            if (!fresh || zoneSnapshot(fresh) !== zoneSnapshot(baseline)) throw new FormValidationError("The zone changed since review. Refresh before another save.");
          }
          const saved = baseline ? await api.updateDeliveryZone(baseline.id, request) : await api.createDeliveryZone(request);
          return confirmedZone(saved, request, restaurantId, baseline);
        }, saved => {
          if (baseline) adopt(saved); else { adopt(); setOpen(false); }
          setNotice("Server confirmed the delivery zone. Current configuration is refreshing."); reload();
        }, () => { blocked.current = true; setNeedsReview(true); setNotice(null); setReconciled(null); });
      }} />
    <ConfirmDialog visible={discard} title="Discard zone changes?" message="Load the latest available zone values and discard this unsaved draft? Published coverage is unchanged by discarding." confirmLabel="Discard changes" danger
      onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); adopt(zone); setOpen(false); setNotice(null); }} />
  </Card>;
}
