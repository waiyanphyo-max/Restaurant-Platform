import { useEffect, useRef, useState } from "react";
import type { CustomerProfileRequest } from "@restaurant-platform/shared-types";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { getCustomerApi } from "../../api";
import { useCustomerAuth } from "../../auth/AuthProvider";
import { Action, Body, Card, FormField, Page, StateView } from "../../components/ui";
import { customerLanguage, queryStateLabel, useCustomerText } from "../../i18n";
import { enableCustomerNotifications, retryCustomerDeviceCleanup } from "../../notifications/native";
import { readEmbeddedTenant } from "../../tenant";
import { homeAddress, useCustomerAccount } from "./AccountProvider";

export function ProfileScreen() {
  const account = useCustomerAccount();
  const auth = useCustomerAuth();
  const tenant = readEmbeddedTenant();
  const router = useRouter();
  const t = useCustomerText();
  const [form, setForm] = useState<CustomerProfileRequest | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try { await action(); }
    catch { if (alive.current) setNotice(t("Unable to confirm the change. Check your connection, refresh, and try again.",
      "ပြောင်းလဲမှုကို အတည်မပြုနိုင်ပါ။ အင်တာနက်ချိတ်ဆက်မှု စစ်ဆေးပြီး အသစ်ပြန်ရယူကာ ထပ်ကြိုးစားပါ။")); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function saveProfile() {
    if (!form) return;
    const request = { ...form, fullName: form.fullName.trim(), phone: form.phone.trim() };
    const errors = {
      fullName: !request.fullName ? t("Enter your full name.", "အမည်အပြည့်အစုံ ရိုက်ထည့်ပါ။")
        : request.fullName.length > 150 ? t("Use 150 characters or fewer for your name.", "အမည်ကို စာလုံး ၁၅၀ အောက် ရိုက်ထည့်ပါ။") : undefined,
      phone: !request.phone ? t("Enter a contact phone number. This does not verify your sign-in phone.", "ဆက်သွယ်ရန် ဖုန်းနံပါတ် ရိုက်ထည့်ပါ။ ဤနံပါတ်သည် အကောင့်ဝင်ရန် အသုံးပြုသည့် ဖုန်းနံပါတ်ကို အတည်မပြုပါ။")
        : request.phone.length > 30 ? t("Use 30 characters or fewer for your contact phone.", "ဖုန်းနံပါတ်ကို စာလုံး ၃၀ အောက် ရိုက်ထည့်ပါ။") : undefined
    };
    setFieldErrors(errors);
    setNotice(null);
    if (errors.fullName || errors.phone) return;
    void perform(async () => {
      await getCustomerApi().updateProfile(request);
      if (alive.current) { setForm(null); account.reload(); }
    });
  }
  const title = t("Profile", "ပရိုဖိုင်");
  const logOut = t("Log out", "အကောင့်မှ ထွက်ရန်");
  const cancel = t("Cancel", "မလုပ်တော့ပါ");
  if (account.state.status !== "ready") return <Page title={title}>
    <StateView kind={account.state.status} title={queryStateLabel(account.state.status, t)} onRetry={account.reload} retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} />
    <Action title={logOut} onPress={() => { void auth.signOut().catch(() => undefined); }} /></Page>;
  const { profile, addresses } = account.state.data;
  const home = homeAddress(addresses);
  return <Page title={title} onRefresh={account.reload}>
    {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
    <Card title={t("Account details", "အကောင့် အချက်အလက်")}>
      <Body>{profile.fullName || t("Add your name", "သင့်အမည် ထည့်ရန်")}</Body>
      <Body>{t("Contact phone", "ဆက်သွယ်ရန် ဖုန်းနံပါတ်")} · {profile.phone || t("Not provided", "မထည့်ရသေးပါ")}</Body>
      <Body>{t("Contact details are separate from your verified sign-in identity.", "ဆက်သွယ်ရန် အချက်အလက်များနှင့် အကောင့်ဝင်ရန် အတည်ပြုထားသော အချက်အလက်များ သီးခြားဖြစ်ပါသည်။")}</Body>
      {form ? <>
        <FormField label={t("Full name (required)", "အမည်အပြည့်အစုံ (လိုအပ်သည်)")} value={form.fullName} maxLength={150} error={fieldErrors.fullName} onChangeText={fullName => {
          setForm({ ...form, fullName }); setFieldErrors(previous => ({ ...previous, fullName: undefined }));
        }} />
        <FormField label={t("Contact phone (required)", "ဆက်သွယ်ရန် ဖုန်းနံပါတ် (လိုအပ်သည်)")} value={form.phone} keyboardType="phone-pad" maxLength={30} error={fieldErrors.phone} onChangeText={phone => {
          setForm({ ...form, phone }); setFieldErrors(previous => ({ ...previous, phone: undefined }));
        }} />
        <View style={{ flexDirection: "row", gap: 8 }}><Action title="English" secondary={form.preferredLanguage !== "en"} onPress={() => setForm({ ...form, preferredLanguage: "en" })} />
          <Action title="မြန်မာ" secondary={form.preferredLanguage !== "my-MM"} onPress={() => setForm({ ...form, preferredLanguage: "my-MM" })} /></View>
        <Action title={t("Save account details", "အကောင့် အချက်အလက် သိမ်းရန်")} disabled={busy} onPress={saveProfile} />
        <Action title={cancel} secondary disabled={busy} onPress={() => { setForm(null); setFieldErrors({}); }} />
      </> : <Action title={t("Edit account details", "အကောင့် အချက်အလက် ပြင်ရန်")} secondary onPress={() => {
        setFieldErrors({}); setForm({ fullName: profile.fullName ?? "", phone: profile.phone ?? "", preferredLanguage: customerLanguage(profile.preferredLanguage) });
      }} />}
    </Card>
    <Card title={t("Home Address", "အိမ်လိပ်စာ")}>
      {home ? <><Body>{[home.houseNo, home.street, home.ward, home.township, home.city].filter(Boolean).join(", ")}</Body>
        <Body>{home.latitude != null && home.longitude != null ? t("Map location saved", "မြေပုံနေရာ သိမ်းထားသည်")
          : t("No confirmed map location saved", "အတည်ပြုထားသော မြေပုံနေရာ မရှိသေးပါ")}</Body>
        <Action title={t("Change saved Home Address", "သိမ်းထားသော အိမ်လိပ်စာ ပြင်ရန်")} onPress={() => account.editAddress(home)} /></>
        : <><Body>{t("No Home Address saved yet. You can set it up whenever you are ready.", "အိမ်လိပ်စာ မသိမ်းရသေးပါ။ အဆင်ပြေသည့်အခါ ထည့်နိုင်ပါသည်။")}</Body>
          <Action title={t("Set up Home Address", "အိမ်လိပ်စာ ထည့်ရန်")} onPress={() => account.editAddress()} /></>}
    </Card>
    {addresses.map(address => <Card key={address.id} title={address.isDefault ? `${address.label} · ${t("Default", "ပုံသေ")}` : address.label}>
      <Body>{[address.recipientName, address.houseNo, address.street, address.ward, address.township, address.city].filter(Boolean).join(", ")}</Body>
      {address.deliveryNote ? <Body>{address.deliveryNote}</Body> : null}
      <Action title={t(`View or change ${address.label}`, `${address.label} ကြည့်ရန် သို့မဟုတ် ပြင်ရန်`)} secondary disabled={busy} onPress={() => account.editAddress(address)} />
      {!address.isDefault ? <Action title={t("Use as default", "ပုံသေလိပ်စာအဖြစ် သုံးရန်")} secondary disabled={busy} onPress={() => { void perform(async () => {
        await getCustomerApi().setDefaultAddress(address.id); if (alive.current) account.reload();
      }); }} /> : null}
      {deleting === address.id ? <>
        <Body>{t(`Delete ${address.label} from your saved addresses?`, `သိမ်းထားသော လိပ်စာများမှ ${address.label} ကို ဖျက်မလား။`)}</Body>
        <Action title={t("Confirm address deletion", "လိပ်စာဖျက်ရန် အတည်ပြုပါ")} disabled={busy} onPress={() => { void perform(async () => {
          await getCustomerApi().deleteAddress(address.id);
          if (alive.current) { setDeleting(null); account.reload(); }
        }); }} />
        <Action title={cancel} disabled={busy} secondary onPress={() => setDeleting(null)} />
      </> : <Action title={t("Delete saved address", "သိမ်းထားသော လိပ်စာ ဖျက်ရန်")} secondary disabled={busy} onPress={() => setDeleting(address.id)} />}
    </Card>)}
    {addresses.length ? <Action title={t("Add another address", "နောက်ထပ် လိပ်စာ ထည့်ရန်")} secondary onPress={() => account.editAddress()} /> : null}
    <Card title={t("Notifications", "အသိပေးချက်များ")}>
      <Action title={t("View notification history", "အသိပေးချက်မှတ်တမ်း ကြည့်ရန်")} secondary onPress={() => router.navigate("/notifications")} />
      <Body>{tenant.notificationsEnabled ? t("Receive order updates on this device.", "အမှာစာ အခြေအနေပြောင်းလဲမှုများကို ဤစက်တွင် လက်ခံပါ။")
        : t("Order notifications are not configured in this app yet.", "ဤအက်ပ်တွင် အမှာစာအတွက် စက်သို့ အသိပေးချက်ပို့ခြင်းကို မသတ်မှတ်ရသေးပါ။")}</Body>
      <Action title={t("Enable notifications", "အသိပေးချက်များ ဖွင့်ရန်")} disabled={busy || !tenant.notificationsEnabled} onPress={() => { void perform(async () => {
        const result = await enableCustomerNotifications(t); if (alive.current) setNotice(result);
      }); }} />
      <Action title={t("Retry pending device cleanup", "စက်မှတ်ပုံတင် ဖြုတ်ရန် ထပ်ကြိုးစားပါ")} secondary disabled={busy || !tenant.notificationsEnabled} onPress={() => { void perform(async () => {
        await retryCustomerDeviceCleanup(); if (alive.current) setNotice(t("Pending device cleanup checked.", "စက်မှတ်ပုံတင် ဖြုတ်ရန် ကျန်ရှိမှုကို စစ်ဆေးပြီးပါပြီ။"));
      }); }} />
    </Card>
    <Action title={logOut} disabled={busy} onPress={() => { void perform(auth.signOut); }} secondary />
  </Page>;
}
