import { useState } from "react";
import { Image } from "react-native";
import type { RestaurantResponse, RestaurantSettingsRequest, RestaurantSettingsResponse, UpdateRestaurantRequest } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { pickAndUploadImage } from "../../components/imageUpload";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { FormStatus, Toggle } from "./controls";
import { coordinate, optionalText, requiredText, wholeAmount } from "./validation";

export function SettingsScreen() {
  const profile = useApiQuery(signal => getOperationsApi().getRestaurant({ signal }), "managed-profile");
  const settings = useApiQuery(signal => getOperationsApi().getSettings({ signal }), "managed-settings");
  const { state } = useOperationsAuth();
  const owner = state.status === "ready" && state.membership.role === "OWNER";
  return <Page title="Restaurant" subtitle="Profile, ordering and delivery preferences" onRefresh={() => { profile.reload(); settings.reload(); }} refreshing={profile.state.status === "loading" || settings.state.status === "loading"}>
    <QueryResult {...profile}>{restaurant => <ProfileForm restaurant={restaurant} owner={owner} reload={profile.reload} />}</QueryResult>
    <QueryResult {...settings}>{data => <SettingsForm settings={data} reload={settings.reload} />}</QueryResult>
  </Page>;
}

function ProfileForm({ restaurant, owner, reload }: { restaurant: RestaurantResponse; owner: boolean; reload(): void }) {
  const [fields, setFields] = useState({ name: restaurant.name, description: restaurant.description ?? "", phone: restaurant.phone ?? "", address: restaurant.address ?? "",
    houseNo: restaurant.houseNo ?? "", street: restaurant.street ?? "", ward: restaurant.ward ?? "", township: restaurant.township ?? "", city: restaurant.city ?? "",
    latitude: restaurant.latitude?.toString() ?? "", longitude: restaurant.longitude?.toString() ?? "" });
  const [validation, setValidation] = useState<string | null>(null);
  const mutation = useApiMutation();
  const field = (key: keyof typeof fields, label: string, maxLength: number, multiline = false) => <FormField label={label} value={fields[key]} onChangeText={value => setFields(current => ({ ...current, [key]: value }))} maxLength={maxLength} multiline={multiline} editable={!mutation.busy} />;
  function save() {
    setValidation(null);
    try {
      const body: UpdateRestaurantRequest = {
        name: requiredText(fields.name, 150, "Restaurant name"), description: optionalText(fields.description, 4000, "Description"), phone: optionalText(fields.phone, 30, "Phone"),
        address: optionalText(fields.address, 2000, "Address"), houseNo: optionalText(fields.houseNo, 50, "House number"), street: optionalText(fields.street, 100, "Street"),
        ward: optionalText(fields.ward, 100, "Ward"), township: requiredText(fields.township, 100, "Township"), city: requiredText(fields.city, 100, "City"),
        latitude: coordinate(fields.latitude, 90, "Latitude"), longitude: coordinate(fields.longitude, 180, "Longitude"), logoUrl: restaurant.logoUrl
      };
      void mutation.run(() => getOperationsApi().updateRestaurantProfile(body), reload);
    } catch (error) { setValidation(error instanceof Error ? error.message : "Check the profile fields."); }
  }
  return <Card title="Restaurant profile">
    {restaurant.logoUrl ? <Image accessibilityLabel={`${restaurant.name} logo`} source={{ uri: restaurant.logoUrl }} style={{ width: 88, height: 88, borderRadius: 12 }} /> : <Body>No restaurant logo uploaded.</Body>}
    <Body>Public slug: {restaurant.slug ?? "Unavailable"} · {restaurant.active ? "Active" : "Inactive"}</Body>
    {field("name", "Restaurant name", 150)}{field("description", "Description", 4000, true)}{field("phone", "Contact phone", 30)}{field("address", "Address", 2000, true)}
    {field("houseNo", "House number", 50)}{field("street", "Street", 100)}{field("ward", "Ward", 100)}{field("township", "Township", 100)}{field("city", "City", 100)}
    {field("latitude", "Latitude (optional)", 30)}{field("longitude", "Longitude (optional)", 30)}
    <FormStatus error={validation ?? mutation.error} message={mutation.message} />
    <Action title={mutation.busy ? "Saving…" : "Save profile"} disabled={mutation.busy} onPress={save} />
    {owner ? <><Body>Logo: PNG, JPEG or WebP, up to 5 MB.</Body><Action title="Choose and upload logo" secondary disabled={mutation.busy} onPress={() => {
      setValidation(null); void mutation.run(() => pickAndUploadImage(file => getOperationsApi().uploadRestaurantLogo(file)), uploaded => { if (uploaded) reload(); });
    }} /></> : null}
  </Card>;
}

function SettingsForm({ settings, reload }: { settings: RestaurantSettingsResponse; reload(): void }) {
  const [currency, setCurrency] = useState(settings.currency);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [minimumOrder, setMinimumOrder] = useState(String(settings.minimumOrder));
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState(String(settings.defaultDeliveryFee));
  const [flags, setFlags] = useState({ acceptsOrders: settings.acceptsOrders, allowQrOrder: settings.allowQrOrder, allowDelivery: settings.allowDelivery, allowTakeaway: settings.allowTakeaway });
  const [validation, setValidation] = useState<string | null>(null);
  const [pending, setPending] = useState<RestaurantSettingsRequest | null>(null);
  const mutation = useApiMutation();
  function save() {
    setValidation(null);
    try {
      const currencyCode = requiredText(currency, 3, "Currency").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Currency must be a three-letter code, such as MMK.");
      const zone = requiredText(timezone, 60, "Timezone");
      try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { throw new Error("Enter a valid IANA timezone, such as Asia/Yangon."); }
      setPending({ currency: currencyCode, timezone: zone, minimumOrder: wholeAmount(minimumOrder, "Minimum order"), defaultDeliveryFee: wholeAmount(defaultDeliveryFee, "Default delivery fee"), ...flags });
    } catch (error) { setValidation(error instanceof Error ? error.message : "Check the settings fields."); }
  }
  return <Card title="Ordering settings">
    <Body>Current currency: {settings.currency} · Restaurant timezone: {settings.timezone}</Body>
    <FormField label="Currency code" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} editable={!mutation.busy} />
    <FormField label="Restaurant timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" maxLength={60} editable={!mutation.busy} />
    <FormField label="Minimum order (whole amount)" value={minimumOrder} onChangeText={setMinimumOrder} keyboardType="number-pad" editable={!mutation.busy} />
    <FormField label="Default delivery fee (whole amount)" value={defaultDeliveryFee} onChangeText={setDefaultDeliveryFee} keyboardType="number-pad" editable={!mutation.busy} />
    {([ ["acceptsOrders", "Accept new orders"], ["allowQrOrder", "Allow QR ordering"], ["allowDelivery", "Allow delivery"], ["allowTakeaway", "Allow takeaway"] ] as const).map(([key, label]) =>
      <Toggle key={key} label={label} value={flags[key]} disabled={mutation.busy} onChange={value => setFlags(current => ({ ...current, [key]: value }))} />)}
    <FormStatus error={validation ?? mutation.error} message={mutation.message} />
    <Action title={mutation.busy ? "Saving…" : "Review settings update"} disabled={mutation.busy} onPress={save} />
    <ConfirmDialog visible={pending !== null} title="Update restaurant settings?" message="These preferences affect new orders. Currency and timezone changes may also change how historical records are labelled. They do not convert existing monetary values." confirmLabel="Save settings" onCancel={() => setPending(null)} onConfirm={() => {
      const body = pending; setPending(null); if (body) void mutation.run(() => getOperationsApi().updateSettings(body), reload);
    }} />
  </Card>;
}
