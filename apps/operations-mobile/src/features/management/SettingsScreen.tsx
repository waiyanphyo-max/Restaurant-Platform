import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Image, View } from "react-native";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { RestaurantResponse, RestaurantSettingsRequest, RestaurantSettingsResponse, UpdateRestaurantRequest } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { useRuntimeBranding } from "../../branding/RuntimeBrandingProvider";
import { useImageUpload } from "../../components/useImageUpload";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page, StateView, Status } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { FormStatus, Toggle } from "./controls";
import { coordinate, optionalText, requiredText, wholeAmount } from "./validation";
import { RuntimePaletteEditor } from "./RuntimePaletteEditor";

export function SettingsScreen() {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || !["OWNER", "MANAGER"].includes(state.membership.role)) {
    return <Page title="Restaurant"><StateView kind="forbidden" message="Only the restaurant Owner or Manager can edit restaurant settings." /></Page>;
  }
  return <ManagedSettings key={`${state.userId}:${state.membership.restaurantId}:${state.membership.role}`} />;
}

function ManagedSettings() {
  const profile = useApiQuery(signal => getOperationsApi().getRestaurant({ signal }), "managed-profile", { keepPreviousData: true });
  const settings = useApiQuery(signal => getOperationsApi().getSettings({ signal }), "managed-settings", { keepPreviousData: true });
  const { state } = useOperationsAuth();
  const runtime = useRuntimeBranding();
  const owner = state.status === "ready" && state.membership.role === "OWNER";
  return <Page title="Restaurant" subtitle="Profile, runtime palette, ordering and delivery preferences" onRefresh={() => { profile.reload(); settings.reload(); void runtime.refresh(); }} refreshing={profile.state.status === "loading" || profile.refreshing || settings.state.status === "loading" || runtime.refreshing}>
    <RuntimePaletteEditor />
    <QueryResult {...profile}>{restaurant => <ProfileForm key={runtime.scopeKey} restaurant={restaurant} owner={owner} reload={profile.reload} />}</QueryResult>
    <QueryResult {...settings}>{data => <SettingsForm key={runtime.scopeKey} settings={data} reload={settings.reload} />}</QueryResult>
  </Page>;
}

function ProfileForm({ restaurant, owner, reload }: { restaurant: RestaurantResponse; owner: boolean; reload(): void }) {
  const { state, assertWorkspaceAccess } = useOperationsAuth();
  const runtime = useRuntimeBranding();
  const uploadImage = useImageUpload();
  const [confirmed, setConfirmed] = useState<{ response: RestaurantResponse; baseline: RestaurantResponse } | null>(null);
  const current = confirmed?.baseline === restaurant ? confirmed.response : restaurant;
  const [baseline, setBaseline] = useState(() => profileFields(current));
  const [fields, setFields] = useState(baseline);
  const [validation, setValidation] = useState<string | null>(null);
  const [pending, setPending] = useState<UpdateRestaurantRequest | null>(null);
  const [discard, setDiscard] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mutation = useApiMutation();
  const reviewButton = useRef<ComponentRef<typeof View>>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(baseline);
  const changedRemotely = JSON.stringify(profileFields(current)) !== JSON.stringify(baseline);
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty && !uncertain) { const next = profileFields(current); setBaseline(next); setFields(next); }
  }, [current, dirty, uncertain]);
  const busy = mutation.busy;
  const field = (key: keyof typeof fields, label: string, maxLength: number, multiline = false) => <FormField label={label} value={fields[key]} onChangeText={value => { setFields(current => ({ ...current, [key]: value })); setPending(null); setFeedback(null); }} maxLength={maxLength} multiline={multiline} editable={!busy} />;
  function save() {
    setValidation(null);
    try {
      const body: UpdateRestaurantRequest = {
        name: requiredText(fields.name, 150, "Restaurant name"), description: optionalText(fields.description, 4000, "Description"), phone: optionalText(fields.phone, 30, "Phone"),
        address: optionalText(fields.address, 2000, "Address"), houseNo: optionalText(fields.houseNo, 50, "House number"), street: optionalText(fields.street, 100, "Street"),
        ward: optionalText(fields.ward, 100, "Ward"), township: requiredText(fields.township, 100, "Township"), city: requiredText(fields.city, 100, "City"),
        latitude: coordinate(fields.latitude, 90, "Latitude"), longitude: coordinate(fields.longitude, 180, "Longitude")
      };
      if (busy || uncertain || changedRemotely) return;
      setPending(body);
    } catch (error) { setValidation(error instanceof Error ? error.message : "Check the profile fields."); }
  }
  return <Card title="Restaurant profile">
    <Body>Public name, contact and address appear in customer journeys. Native app identity remains operator-managed.</Body>
    {runtime.logoUrl ? <Image accessibilityLabel={`${runtime.displayName} logo`} source={{ uri: runtime.logoUrl }} style={{ width: 88, height: 88, borderRadius: 12 }} /> : <Body>No safe restaurant logo is available.</Body>}
    <Body>Public slug: {restaurant.slug ?? "Unavailable"} · {restaurant.active ? "Active" : "Inactive"}</Body>
    {field("name", "Restaurant name", 150)}{field("description", "Description", 4000, true)}{field("phone", "Contact phone", 30)}{field("address", "Address", 2000, true)}
    {field("houseNo", "House number", 50)}{field("street", "Street", 100)}{field("ward", "Ward", 100)}{field("township", "Township", 100)}{field("city", "City", 100)}
    {field("latitude", "Latitude (optional)", 30)}{field("longitude", "Longitude (optional)", 30)}
    {dirty ? <Status tone="warning">Unsaved profile changes. Refresh keeps your draft; leaving requires review. မသိမ်းရသေးသော ပြင်ဆင်ချက်များရှိပါသည်။</Status> : null}
    {changedRemotely && dirty ? <Status tone="warning">The profile changed on the server. Discard this draft to load the latest values before reviewing another save.</Status> : null}
    {uncertain ? <><Status tone="warning">The profile save could not be confirmed. Checking the current server profile replaces this draft before another write.</Status><Action title="Check current profile" secondary disabled={busy} onPress={() => {
      if (busy || state.status !== "ready") return;
      const { userId, membership: { role } } = state;
      void mutation.run(() => getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) }).getRestaurant(), result => {
        setConfirmed({ response: result, baseline: restaurant }); const next = profileFields(result); setBaseline(next); setFields(next); setUncertain(false); setFeedback("Current server profile loaded. Review any further edits again."); reload();
      });
    }} /></> : null}
    <FormStatus error={validation ?? mutation.error} message={feedback} />
    <Action ref={reviewButton} title={mutation.busy ? "Saving…" : "Save profile"} accessibilityHint="Opens a review before saving public profile changes." disabled={busy || uncertain || changedRemotely} onPress={save} />
    {dirty ? <Action title="Discard profile changes" secondary disabled={busy || uncertain} onPress={() => setDiscard(true)} /> : null}
    {owner ? <><Body>Logo: PNG, JPEG or WebP, up to 5 MB.</Body><Action title="Choose and upload logo" secondary disabled={busy || dirty || uncertain} onPress={() => {
      setValidation(null); setFeedback(null); void mutation.run(() => uploadImage((api, file) => api.uploadRestaurantLogo(file)), uploaded => { if (uploaded) { setFeedback("Logo upload confirmed by the server."); reload(); void runtime.refresh(); } });
    }} /></> : <Body>The current logo is read-only. Only the Owner can upload a logo.</Body>}
    <ConfirmDialog visible={pending !== null} title="Save restaurant profile?" message={pending ? `Public name: ${pending.name}\nPhone: ${pending.phone ?? "Not set"}\nAddress: ${pending.address ?? "Not set"}\nTownship: ${pending.township}\nCity: ${pending.city}\nThese changes become visible after an authorized refresh.` : ""}
      confirmLabel="Save profile changes" returnFocusRef={reviewButton} confirmDisabled={busy || uncertain || changedRemotely} onCancel={() => setPending(null)} onConfirm={() => {
        if (busy || uncertain || changedRemotely || !pending || state.status !== "ready") return;
        const body = pending; setPending(null); setFeedback(null); const { userId, membership: { role } } = state;
        void mutation.run(() => getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) }).updateRestaurantProfile(body), result => {
          setConfirmed({ response: result, baseline: restaurant }); const next = profileFields(result); setBaseline(next); setFields(next); setFeedback("Profile saved by the server."); reload(); void runtime.refresh();
        }, failure => { if (uncertainWrite(failure)) setUncertain(true); });
      }} />
    <ConfirmDialog visible={discard} title="Discard profile changes?" message="Your unsaved public profile edits will be removed. The saved server profile stays in place." confirmLabel="Discard changes" danger onCancel={() => setDiscard(false)} onConfirm={() => {
      const next = profileFields(current); setBaseline(next); setFields(next); setDiscard(false); setPending(null); setValidation(null); mutation.reset(); setFeedback("Profile draft discarded.");
    }} />
  </Card>;
}

function profileFields(restaurant: RestaurantResponse) {
  return { name: restaurant.name, description: restaurant.description ?? "", phone: restaurant.phone ?? "", address: restaurant.address ?? "",
    houseNo: restaurant.houseNo ?? "", street: restaurant.street ?? "", ward: restaurant.ward ?? "", township: restaurant.township ?? "", city: restaurant.city ?? "",
    latitude: restaurant.latitude?.toString() ?? "", longitude: restaurant.longitude?.toString() ?? "" };
}

function uncertainWrite(failure: unknown) {
  return !(failure instanceof ApiHttpError && failure.status >= 400 && failure.status < 500 && failure.status !== 408);
}

function SettingsForm({ settings, reload }: { settings: RestaurantSettingsResponse; reload(): void }) {
  const { state, assertWorkspaceAccess } = useOperationsAuth();
  const [confirmed, setConfirmed] = useState<{ response: RestaurantSettingsResponse; baseline: RestaurantSettingsResponse } | null>(null);
  const current = confirmed?.baseline === settings ? confirmed.response : settings;
  const [baseline, setBaseline] = useState(() => settingsFields(current));
  const [fields, setFields] = useState(baseline);
  const [validation, setValidation] = useState<string | null>(null);
  const [pending, setPending] = useState<RestaurantSettingsRequest | null>(null);
  const [discard, setDiscard] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mutation = useApiMutation();
  const reviewButton = useRef<ComponentRef<typeof View>>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(baseline);
  const changedRemotely = JSON.stringify(settingsFields(current)) !== JSON.stringify(baseline);
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty && !uncertain) { const next = settingsFields(current); setBaseline(next); setFields(next); }
  }, [current, dirty, uncertain]);
  const update = <K extends keyof typeof fields>(key: K, value: typeof fields[K]) => { setFields(current => ({ ...current, [key]: value })); setPending(null); setFeedback(null); };
  const api = () => {
    if (state.status !== "ready") throw new Error("Workspace access is unavailable");
    const { userId, membership: { role } } = state;
    return getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) });
  };
  function save() {
    setValidation(null);
    try {
      if (mutation.busy || uncertain || changedRemotely) return;
      const currencyCode = requiredText(fields.currency, 3, "Currency").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Currency must be a three-letter code, such as MMK.");
      const zone = requiredText(fields.timezone, 60, "Timezone");
      try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { throw new Error("Enter a valid IANA timezone, such as Asia/Yangon."); }
      setPending({ currency: currencyCode, timezone: zone, minimumOrder: wholeAmount(fields.minimumOrder, "Minimum order"), defaultDeliveryFee: wholeAmount(fields.defaultDeliveryFee, "Default delivery fee"),
        acceptsOrders: fields.acceptsOrders, allowQrOrder: fields.allowQrOrder, allowDelivery: fields.allowDelivery, allowTakeaway: fields.allowTakeaway });
    } catch (error) { setValidation(error instanceof Error ? error.message : "Check the settings fields."); }
  }
  return <Card title="Ordering settings">
    <Body>Current currency: {current.currency} · Restaurant timezone: {current.timezone}</Body>
    <Body>Changes affect new QR, Customer and Counter orders and may interrupt a pending checkout. Existing orders and payments remain. Normal settings changes keep current QR credentials.</Body>
    <FormField label="Currency code" value={fields.currency} onChangeText={value => update("currency", value)} autoCapitalize="characters" maxLength={3} editable={!mutation.busy} />
    <FormField label="Restaurant timezone" value={fields.timezone} onChangeText={value => update("timezone", value)} autoCapitalize="none" maxLength={60} editable={!mutation.busy} />
    <FormField label="Minimum order (whole amount)" value={fields.minimumOrder} onChangeText={value => update("minimumOrder", value)} keyboardType="number-pad" editable={!mutation.busy} />
    <FormField label="Default delivery fee (whole amount)" value={fields.defaultDeliveryFee} onChangeText={value => update("defaultDeliveryFee", value)} keyboardType="number-pad" editable={!mutation.busy} />
    {([ ["acceptsOrders", "Accept new orders"], ["allowQrOrder", "Allow QR ordering"], ["allowDelivery", "Allow delivery"], ["allowTakeaway", "Allow takeaway"] ] as const).map(([key, label]) =>
      <Toggle key={key} label={label} value={fields[key]} disabled={mutation.busy} onChange={value => update(key, value)} />)}
    {dirty ? <Status tone="warning">Unsaved ordering changes. Review the customer impact before saving. မသိမ်းရသေးသော ပြင်ဆင်ချက်များရှိပါသည်။</Status> : null}
    {changedRemotely && dirty ? <Status tone="warning">Ordering settings changed on the server. Your draft is preserved. Discard it to load the latest values before saving.</Status> : null}
    {uncertain ? <><Status tone="warning">The settings save could not be confirmed. Checking current server settings replaces this draft before editing and reviewing another save.</Status><Action title="Check current ordering settings" secondary disabled={mutation.busy} onPress={() => {
      void mutation.run(() => api().getSettings(), result => { setConfirmed({ response: result, baseline: settings }); const next = settingsFields(result); setBaseline(next); setFields(next); setUncertain(false); setPending(null); setFeedback("Current ordering settings loaded. Review any further changes again."); reload(); });
    }} /></> : null}
    <FormStatus error={validation ?? mutation.error} message={feedback} />
    <Action ref={reviewButton} title={mutation.busy ? "Saving…" : "Review settings update"} disabled={mutation.busy || uncertain || changedRemotely} onPress={save} />
    {dirty ? <Action title="Discard ordering changes" secondary disabled={mutation.busy || uncertain} onPress={() => setDiscard(true)} /> : null}
    <ConfirmDialog visible={pending !== null} title="Update restaurant settings?" message={pending ? orderingReview(current, pending) : ""} confirmLabel="Save settings" returnFocusRef={reviewButton} confirmDisabled={mutation.busy || uncertain || changedRemotely} onCancel={() => setPending(null)} onConfirm={() => {
      const body = pending; if (!body || mutation.busy || uncertain || changedRemotely) return; setPending(null); setFeedback(null);
      void mutation.run(() => api().updateSettings(body), result => {
        setConfirmed({ response: result, baseline: settings }); const next = settingsFields(result); setBaseline(next); setFields(next); setFeedback("Ordering settings saved by the server. Current QR credentials are unchanged."); reload();
      }, failure => { if (uncertainWrite(failure)) setUncertain(true); });
    }} />
    <ConfirmDialog visible={discard} title="Discard ordering changes?" message="Your unsaved ordering preferences will be removed. Current server settings remain." confirmLabel="Discard changes" danger onCancel={() => setDiscard(false)} onConfirm={() => {
      const next = settingsFields(current); setBaseline(next); setFields(next); setDiscard(false); setPending(null); setValidation(null); mutation.reset(); setFeedback("Ordering draft discarded.");
    }} />
  </Card>;
}

function settingsFields(settings: RestaurantSettingsResponse) {
  return { currency: settings.currency, timezone: settings.timezone, minimumOrder: String(settings.minimumOrder), defaultDeliveryFee: String(settings.defaultDeliveryFee),
    acceptsOrders: settings.acceptsOrders, allowQrOrder: settings.allowQrOrder, allowDelivery: settings.allowDelivery, allowTakeaway: settings.allowTakeaway };
}

function orderingReview(current: RestaurantSettingsResponse, proposed: RestaurantSettingsRequest) {
  const state = (value: boolean) => value ? "Enabled" : "Disabled";
  return `Accept new orders: ${state(current.acceptsOrders)} → ${state(proposed.acceptsOrders)}\nQR ordering: ${state(current.allowQrOrder)} → ${state(proposed.allowQrOrder)}\nDelivery: ${state(current.allowDelivery)} → ${state(proposed.allowDelivery)}\nTakeaway: ${state(current.allowTakeaway)} → ${state(proposed.allowTakeaway)}\nMinimum order: ${current.minimumOrder} → ${proposed.minimumOrder} ${proposed.currency}\nDefault delivery fee: ${current.defaultDeliveryFee} → ${proposed.defaultDeliveryFee} ${proposed.currency}\nCurrency: ${current.currency} → ${proposed.currency}\nTimezone: ${current.timezone} → ${proposed.timezone}\nThese preferences affect new orders and pending customer checkouts. Existing orders are not cancelled, payments are not collected and QR credentials are not rotated. Currency and timezone changes may change historical labels; existing amounts are not converted.`;
}
