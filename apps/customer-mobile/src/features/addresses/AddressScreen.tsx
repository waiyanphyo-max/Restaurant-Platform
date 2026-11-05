import { useEffect, useRef, useState } from "react";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { CustomerAddressResponse } from "@restaurant-platform/shared-types";
import { Switch, Text, View } from "react-native";
import { getCustomerApi } from "../../api";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { readEmbeddedTenant } from "../../tenant";
import { addressRequest, initialAddressForm, savedPin, validateAddress, type AddressForm } from "./address";
import { AddressMap } from "./AddressMap";
import { confirmPin, emptyPin, LocationSelectionError, selectPin, type Coordinates } from "./location";
import { suggestCurrentLocation } from "./native-location";

export function AddressScreen({ address, onSaved, onCancel }: {
  address?: CustomerAddressResponse;
  onSaved(): void;
  onCancel(): void;
}) {
  const tenant = readEmbeddedTenant();
  const [form, setForm] = useState(() => initialAddressForm(address));
  const [selection, setSelection] = useState(() => savedPin(address));
  const [mode, setMode] = useState<"details" | "map" | "review">("details");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestGeneration = useRef(0);
  const active = useRef(true);
  const savingRef = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; requestGeneration.current++; mutation.current?.abort(); };
  }, []);

  function update<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setError(null);
  }

  function choosePin(coordinates: Coordinates) {
    requestGeneration.current++;
    setLocating(false);
    setSelection(selectPin(coordinates, "map"));
    setNotice(null);
    setError(null);
  }

  async function locate() {
    if (!tenant.mapsConfigured || locating) return;
    const generation = ++requestGeneration.current;
    setMode("map");
    setLocating(true);
    setNotice(null);
    setError(null);
    try {
      const result = await suggestCurrentLocation();
      if (!active.current || generation !== requestGeneration.current) return;
      setSelection(selectPin(result.coordinates, "gps"));
      setNotice(result.accuracyWarning ?? "GPS suggested this position. Check the pin and confirm your delivery entrance.");
    } catch (cause) {
      if (active.current && generation === requestGeneration.current) {
        setNotice(cause instanceof LocationSelectionError ? cause.message : "Current location is unavailable. Choose a pin manually.");
      }
    } finally {
      if (active.current && generation === requestGeneration.current) setLocating(false);
    }
  }

  function closeMap() {
    requestGeneration.current++;
    setLocating(false);
    setMode("details");
  }

  function review() {
    const invalid = validateAddress(form, selection);
    setError(invalid);
    if (!invalid) setMode("review");
  }

  async function save() {
    if (savingRef.current) return;
    const invalid = validateAddress(form, selection);
    if (invalid) { setError(invalid); setMode("details"); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const api = getCustomerApi();
      const request = addressRequest(form, selection);
      if (address) await api.updateAddress(address.id, request, { signal: controller.signal });
      else await api.createAddress(request, { signal: controller.signal });
      if (active.current) onSaved();
    } catch (cause) {
      if (!active.current) return;
      const denied = cause instanceof MissingAccessTokenError || cause instanceof ApiHttpError && [401, 403].includes(cause.status);
      setError(denied ? "Your session cannot save this address. Sign in again and retry."
        : cause instanceof ApiNetworkError || cause instanceof ApiTimeoutError
          ? "The address could not be confirmed with the server. Reconnect, check your saved addresses, then retry."
          : cause instanceof ApiHttpError && cause.status === 404
            ? "This saved address is no longer available to your account. Return to your profile and refresh."
            : "The address could not be saved. Check the details and try again.");
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }

  const coordinates = selection.coordinates;
  return <>
    <Page title={address ? "Change Saved Address" : "Set Up Your Home Address"}
      subtitle="Save a delivery address now, or complete this step later from Profile.">
      {mode === "review" ? <Card title="Confirm Address Details">
        <Body>{form.label} · {form.recipientName || "Recipient not provided"}</Body>
        <Body>{[form.houseNo, form.street, form.ward, form.township, form.city].filter(Boolean).join(", ")}</Body>
        {form.deliveryNote ? <Body>{form.deliveryNote}</Body> : null}
        {coordinates ? <Body>Confirmed pin: {coordinates.latitude.toFixed(7)}, {coordinates.longitude.toFixed(7)}</Body>
          : <Body>No map location saved. Delivery checkout will require an eligible confirmed address.</Body>}
        <Body>{form.makeDefault ? "Use as default address" : "Keep existing default preference"}</Body>
        {error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c" }}>{error}</Text> : null}
        <Action title={saving ? "Saving Address…" : form.label.trim().toLowerCase() === "home" ? "Save as Home Address" : "Save Address"}
          onPress={() => void save()} disabled={saving} />
        <Action title="Edit Address Details" onPress={() => setMode("details")} secondary disabled={saving} />
      </Card> : <>
        <Card title="Delivery Location">
          <Body>Choose a map pin without granting GPS permission, or enter your address manually.</Body>
          {!tenant.mapsConfigured ? <Text accessibilityRole="alert" style={{ color: "#92400e" }}>
            Google Maps is unavailable in this build. You can save a manual address or skip setup.
          </Text> : null}
          <Action title="Choose Location on Map" onPress={() => { setNotice(null); setMode("map"); }} disabled={!tenant.mapsConfigured} />
          <Action title="Use My Current Location" onPress={() => void locate()} disabled={!tenant.mapsConfigured || locating} secondary />
          <Action title="Manual Address Entry" onPress={() => { setMode("details"); setNotice("Enter your address in the fields below. A map pin is optional during account setup."); }} secondary />
          {notice ? <Body>{notice}</Body> : null}
          {coordinates ? <>
            <Body>{selection.confirmed ? "Confirmed location" : "Location selected — map confirmation required"}: {coordinates.latitude.toFixed(7)}, {coordinates.longitude.toFixed(7)}</Body>
            <Action title="Remove Location and Use Manual Address" secondary onPress={() => {
              requestGeneration.current++; setSelection({ ...emptyPin }); setNotice(null); setError(null);
            }} />
          </> : <Body>No map location selected.</Body>}
        </Card>
        <Card title="Address Details">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["Home", "Work", "Custom"].map(label => <Action key={label} title={label}
              secondary={label === "Custom" ? ["Home", "Work"].includes(form.label) : form.label !== label}
              onPress={() => update("label", label === "Custom" ? "" : label)} />)}
          </View>
          <FormField label="Address Label" value={form.label} onChangeText={value => update("label", value)} maxLength={50} />
          <FormField label="Recipient Name (Optional)" value={form.recipientName} onChangeText={value => update("recipientName", value)} maxLength={150} />
          <FormField label="Building, Floor or Room (Optional)" value={form.houseNo} onChangeText={value => update("houseNo", value)} maxLength={50} />
          <FormField label="Street or Detailed Address (Optional)" value={form.street} onChangeText={value => update("street", value)} maxLength={100} />
          <FormField label="Ward or Neighborhood (Optional)" value={form.ward} onChangeText={value => update("ward", value)} maxLength={100} />
          <FormField label="Township or Area" value={form.township} onChangeText={value => update("township", value)} maxLength={100} />
          <FormField label="City" value={form.city} onChangeText={value => update("city", value)} maxLength={100} />
          <FormField label="Delivery Landmark and Instructions (Optional)" value={form.deliveryNote}
            onChangeText={value => update("deliveryNote", value)} maxLength={2000} multiline />
          <Body>Contact phone is managed separately in your account details.</Body>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Body>Use as default address</Body>
            <Switch accessibilityLabel="Use as default address" value={form.makeDefault} onValueChange={value => update("makeDefault", value)} />
          </View>
          {error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c" }}>{error}</Text> : null}
          <Action title="Review Address" onPress={review} />
        </Card>
      </>}
      <Action title={address ? "Cancel" : "Skip for Now"} onPress={onCancel} secondary disabled={saving} />
      <Body>Your precise location is saved privately to your account only after you confirm and save. Location services are never required to create an account.</Body>
    </Page>
    {mode === "map" && tenant.mapsConfigured ? <AddressMap selection={selection} locating={locating} notice={notice}
      onSelect={choosePin} onLocate={() => void locate()} onCancel={closeMap}
      onConfirm={() => { setSelection(confirmPin(selection)); setNotice(null); closeMap(); }} /> : null}
  </>;
}
