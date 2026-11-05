import { useEffect, useRef, useState } from "react";
import type { CustomerProfileRequest } from "@restaurant-platform/shared-types";
import { Text, View } from "react-native";
import { getCustomerApi } from "../../api";
import { useCustomerAuth } from "../../auth/AuthProvider";
import { Action, Body, Card, FormField, Page, StateView } from "../../components/ui";
import { enableCustomerNotifications, retryCustomerDeviceCleanup } from "../../notifications/native";
import { readEmbeddedTenant } from "../../tenant";
import { homeAddress, useCustomerAccount } from "./AccountProvider";

export function ProfileScreen() {
  const account = useCustomerAccount();
  const auth = useCustomerAuth();
  const tenant = readEmbeddedTenant();
  const [form, setForm] = useState<CustomerProfileRequest | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try { await action(); }
    catch { if (alive.current) setNotice("Unable to confirm the change. Check your connection, refresh, and try again."); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function saveProfile() {
    if (!form) return;
    const request = { ...form, fullName: form.fullName.trim(), phone: form.phone.trim() };
    const errors = {
      fullName: !request.fullName ? "Enter your full name." : request.fullName.length > 150 ? "Use 150 characters or fewer for your name." : undefined,
      phone: !request.phone ? "Enter a contact phone number. This does not verify your sign-in phone." : request.phone.length > 30 ? "Use 30 characters or fewer for your contact phone." : undefined
    };
    setFieldErrors(errors);
    setNotice(null);
    if (errors.fullName || errors.phone) return;
    void perform(async () => {
      await getCustomerApi().updateProfile(request);
      if (alive.current) { setForm(null); account.reload(); }
    });
  }
  if (account.state.status !== "ready") return <Page title="Profile"><StateView kind={account.state.status} onRetry={account.reload} />
    <Action title="Log out" onPress={() => { void auth.signOut().catch(() => undefined); }} /></Page>;
  const { profile, addresses } = account.state.data;
  const home = homeAddress(addresses);
  return <Page title="Profile" onRefresh={account.reload}>
    {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
    <Card title="Account details">
      <Body>{profile.fullName || "Add your name"}</Body><Body>Contact phone: {profile.phone || "Not provided"}</Body>
      <Body>Contact details are separate from your verified sign-in identity.</Body>
      {form ? <>
        <FormField label="Full name (required)" value={form.fullName} maxLength={150} error={fieldErrors.fullName} onChangeText={fullName => {
          setForm({ ...form, fullName }); setFieldErrors(previous => ({ ...previous, fullName: undefined }));
        }} />
        <FormField label="Contact phone (required)" value={form.phone} keyboardType="phone-pad" maxLength={30} error={fieldErrors.phone} onChangeText={phone => {
          setForm({ ...form, phone }); setFieldErrors(previous => ({ ...previous, phone: undefined }));
        }} />
        <View style={{ flexDirection: "row", gap: 8 }}><Action title="English" secondary={form.preferredLanguage !== "en"} onPress={() => setForm({ ...form, preferredLanguage: "en" })} />
          <Action title="မြန်မာ" secondary={form.preferredLanguage !== "my-MM"} onPress={() => setForm({ ...form, preferredLanguage: "my-MM" })} /></View>
        <Action title="Save account details" disabled={busy} onPress={saveProfile} /><Action title="Cancel" secondary disabled={busy} onPress={() => { setForm(null); setFieldErrors({}); }} />
      </> : <Action title="Edit account details" secondary onPress={() => {
        setFieldErrors({}); setForm({ fullName: profile.fullName ?? "", phone: profile.phone ?? "", preferredLanguage: profile.preferredLanguage === "my-MM" ? "my-MM" : "en" });
      }} />}
    </Card>
    <Card title="Home Address">
      {home ? <><Body>{[home.houseNo, home.street, home.ward, home.township, home.city].filter(Boolean).join(", ")}</Body>
        <Body>{home.latitude != null && home.longitude != null ? "Map location saved" : "No confirmed map location saved"}</Body>
        <Action title="Change saved Home Address" onPress={() => account.editAddress(home)} /></>
        : <><Body>No Home Address saved yet. You can set it up whenever you are ready.</Body><Action title="Set up Home Address" onPress={() => account.editAddress()} /></>}
    </Card>
    {addresses.map(address => <Card key={address.id} title={`${address.label}${address.isDefault ? " · Default" : ""}`}>
      <Body>{[address.recipientName, address.houseNo, address.street, address.ward, address.township, address.city].filter(Boolean).join(", ")}</Body>
      {address.deliveryNote ? <Body>{address.deliveryNote}</Body> : null}
      <Action title={`View or change ${address.label}`} secondary disabled={busy} onPress={() => account.editAddress(address)} />
      {!address.isDefault ? <Action title="Use as default" secondary disabled={busy} onPress={() => { void perform(async () => {
        await getCustomerApi().setDefaultAddress(address.id); if (alive.current) account.reload();
      }); }} /> : null}
    </Card>)}
    {addresses.length ? <Action title="Add another address" secondary onPress={() => account.editAddress()} /> : null}
    <Card title="Notifications"><Body>{tenant.notificationsEnabled ? "Receive order updates on this device." : "Order notifications are not configured in this app yet."}</Body>
      <Action title="Enable notifications" disabled={busy || !tenant.notificationsEnabled} onPress={() => { void perform(async () => {
        const result = await enableCustomerNotifications(); if (alive.current) setNotice(result);
      }); }} />
      <Action title="Retry pending device cleanup" secondary disabled={busy || !tenant.notificationsEnabled} onPress={() => { void perform(async () => {
        await retryCustomerDeviceCleanup(); if (alive.current) setNotice("Pending device cleanup checked.");
      }); }} />
    </Card>
    <Action title="Log out" disabled={busy} onPress={() => { void perform(auth.signOut); }} secondary />
  </Page>;
}
