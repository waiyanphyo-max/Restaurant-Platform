import { useEffect, useRef, useState } from "react";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { CustomerAddressResponse } from "@restaurant-platform/shared-types";
import { Switch, Text, View } from "react-native";
import { getCustomerApi } from "../../api";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { useCustomerLanguage, useCustomerText } from "../../i18n";
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
  const language = useCustomerLanguage();
  const t = useCustomerText();
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
      setNotice(result.accuracyWarning
        ? t(result.accuracyWarning, "တည်နေရာ တိကျမှု နည်းပါသည်။ အတည်မပြုမီ ဝင်ပေါက်သို့ အမှတ်ကို ရွှေ့ပါ။")
        : t("GPS suggested this position. Check the pin and confirm your delivery entrance.", "GPS ပြသည့်နေရာကို စစ်ဆေးပြီး ပို့ဆောင်မည့် ဝင်ပေါက်ကို အတည်ပြုပါ။"));
    } catch (cause) {
      if (active.current && generation === requestGeneration.current) {
        const denied = cause instanceof LocationSelectionError && cause.code === "denied";
        setNotice(t(cause instanceof LocationSelectionError ? cause.message : "Current location is unavailable. Choose a pin manually.",
          denied ? "တည်နေရာ အသုံးပြုခွင့် မရပါ။ မြေပုံပေါ်တွင် ကိုယ်တိုင်ရွေးပါ။" : "လက်ရှိတည်နေရာ ရှာမတွေ့ပါ။ မြေပုံပေါ်တွင် ကိုယ်တိုင်ရွေးပါ။"));
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
    setError(invalid && t(invalid, "လိပ်စာအချက်အလက်နှင့် မြေပုံနေရာကို စစ်ဆေးပါ။"));
    if (!invalid) setMode("review");
  }

  async function save() {
    if (savingRef.current) return;
    const invalid = validateAddress(form, selection);
    if (invalid) { setError(t(invalid, "လိပ်စာအချက်အလက်နှင့် မြေပုံနေရာကို စစ်ဆေးပါ။")); setMode("details"); return; }
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
      setError(denied ? t("Your session cannot save this address. Sign in again and retry.", "လိပ်စာသိမ်းရန် အကောင့် ပြန်ဝင်ပြီး ထပ်ကြိုးစားပါ။")
        : cause instanceof ApiNetworkError || cause instanceof ApiTimeoutError
          ? t("The address could not be confirmed with the server. Reconnect, check your saved addresses, then retry.",
            "လိပ်စာကို အတည်မပြုနိုင်ပါ။ အင်တာနက်ပြန်ချိတ်၍ သိမ်းထားသော လိပ်စာများကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။")
          : cause instanceof ApiHttpError && cause.status === 404
            ? t("This saved address is no longer available to your account. Return to your profile and refresh.",
              "ဤလိပ်စာကို သင့်အကောင့်တွင် မတွေ့ပါ။ ပရိုဖိုင်သို့ ပြန်ပြီး ပြန်ဖွင့်ပါ။")
            : t("The address could not be saved. Check the details and try again.", "လိပ်စာ မသိမ်းနိုင်ပါ။ အချက်အလက်ကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။"));
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }

  const coordinates = selection.coordinates;
  return <>
    <Page title={address ? t("Change Saved Address", "သိမ်းထားသော လိပ်စာ ပြင်ရန်") : t("Set Up Your Home Address", "အိမ်လိပ်စာ ထည့်ရန်")}
      subtitle={t("Save a delivery address now, or complete this step later from Profile.", "ပို့ဆောင်ရန်လိပ်စာကို ယခု သိမ်းနိုင်ပါသည်။ ပရိုဖိုင်တွင် နောက်မှလည်း ထည့်နိုင်ပါသည်။")}>
      {mode === "review" ? <Card title={t("Confirm Address Details", "လိပ်စာအချက်အလက် အတည်ပြုရန်")}>
        <Body>{form.label} · {form.recipientName || t("Recipient not provided", "လက်ခံသူအမည် မထည့်ထားပါ")}</Body>
        <Body>{[form.houseNo, form.street, form.ward, form.township, form.city].filter(Boolean).join(", ")}</Body>
        {form.deliveryNote ? <Body>{form.deliveryNote}</Body> : null}
        {coordinates ? <Body>{t("Confirmed pin", "အတည်ပြုထားသော နေရာ")} · {coordinates.latitude.toFixed(7)}, {coordinates.longitude.toFixed(7)}</Body>
          : <Body>{t("No map location saved. Delivery checkout will require an eligible confirmed address.",
            "မြေပုံနေရာ မသိမ်းထားပါ။ ပို့ဆောင်မှုမှာယူရန် အတည်ပြုထားသော လိပ်စာ လိုအပ်ပါသည်။")}</Body>}
        <Body>{form.makeDefault ? t("Use as default address", "မူလလိပ်စာအဖြစ် သုံးရန်") : t("Keep existing default preference", "လက်ရှိ မူလလိပ်စာကို ဆက်သုံးရန်")}</Body>
        {error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c" }}>{error}</Text> : null}
        <Action title={saving ? t("Saving Address…", "လိပ်စာ သိမ်းနေပါသည်…") : form.label.trim().toLowerCase() === "home"
          ? t("Save as Home Address", "အိမ်လိပ်စာအဖြစ် သိမ်းရန်") : t("Save Address", "လိပ်စာ သိမ်းရန်")}
          onPress={() => void save()} disabled={saving} />
        <Action title={t("Edit Address Details", "လိပ်စာအချက်အလက် ပြင်ရန်")} onPress={() => setMode("details")} secondary disabled={saving} />
      </Card> : <>
        <Card title={t("Delivery Location", "ပို့ဆောင်မည့်နေရာ")}>
          <Body>{t("Choose a map pin without granting GPS permission, or enter your address manually.",
            "GPS အသုံးပြုခွင့်မပေးဘဲ မြေပုံပေါ်တွင် နေရာရွေးနိုင်ပါသည်။ လိပ်စာကိုလည်း ကိုယ်တိုင် ဖြည့်နိုင်ပါသည်။")}</Body>
          {!tenant.mapsConfigured ? <Text accessibilityRole="alert" style={{ color: "#92400e" }}>
            {t("Google Maps is unavailable in this build. You can save a manual address or skip setup.",
              "ဤအက်ပ်တွင် Google Maps အသုံးမပြုနိုင်ပါ။ လိပ်စာကို ကိုယ်တိုင်ဖြည့်သိမ်းနိုင်ပါသည်။")}
          </Text> : null}
          <Action title={t("Choose Location on Map", "မြေပုံပေါ်တွင် နေရာရွေးရန်")} onPress={() => { setNotice(null); setMode("map"); }} disabled={!tenant.mapsConfigured} />
          <Action title={t("Use My Current Location", "လက်ရှိတည်နေရာ သုံးရန်")} onPress={() => void locate()} disabled={!tenant.mapsConfigured || locating} secondary />
          <Action title={t("Manual Address Entry", "လိပ်စာ ကိုယ်တိုင်ဖြည့်ရန်")} onPress={() => {
            setMode("details"); setNotice(t("Enter your address in the fields below. A map pin is optional during account setup.",
              "အောက်တွင် လိပ်စာဖြည့်ပါ။ အကောင့် စတင်သတ်မှတ်ချိန်တွင် မြေပုံနေရာ မဖြစ်မနေ မလိုအပ်ပါ။"));
          }} secondary />
          {notice ? <Body>{notice}</Body> : null}
          {coordinates ? <>
            <Body>{selection.confirmed ? t("Confirmed location", "အတည်ပြုထားသော နေရာ")
              : t("Location selected — map confirmation required", "နေရာရွေးထားပါသည်။ မြေပုံပေါ်တွင် အတည်ပြုရန် လိုပါသည်။")} · {coordinates.latitude.toFixed(7)}, {coordinates.longitude.toFixed(7)}</Body>
            <Action title={t("Remove Location and Use Manual Address", "မြေပုံနေရာ ဖယ်ပြီး လိပ်စာ ကိုယ်တိုင်ဖြည့်ရန်")} secondary onPress={() => {
              requestGeneration.current++; setSelection({ ...emptyPin }); setNotice(null); setError(null);
            }} />
          </> : <Body>{t("No map location selected.", "မြေပုံနေရာ မရွေးရသေးပါ။")}</Body>}
        </Card>
        <Card title={t("Address Details", "လိပ်စာ အချက်အလက်")}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([["Home", "အိမ်"], ["Work", "အလုပ်"], ["Custom", "အခြား"]] as const).map(([label, my]) => <Action key={label} title={t(label, my)}
              secondary={label === "Custom" ? ["Home", "Work"].includes(form.label) : form.label !== label}
              onPress={() => update("label", label === "Custom" ? "" : label)} />)}
          </View>
          <FormField label={t("Address Label", "လိပ်စာအမည်")} value={form.label} onChangeText={value => update("label", value)} maxLength={50} />
          <FormField label={t("Recipient Name (Optional)", "လက်ခံသူအမည် (လိုပါက)")} value={form.recipientName} onChangeText={value => update("recipientName", value)} maxLength={150} />
          <FormField label={t("Building, Floor or Room (Optional)", "တိုက်၊ အထပ် သို့မဟုတ် အခန်း (လိုပါက)")} value={form.houseNo} onChangeText={value => update("houseNo", value)} maxLength={50} />
          <FormField label={t("Street or Detailed Address (Optional)", "လမ်း သို့မဟုတ် လိပ်စာအသေးစိတ် (လိုပါက)")} value={form.street} onChangeText={value => update("street", value)} maxLength={100} />
          <FormField label={t("Ward or Neighborhood (Optional)", "ရပ်ကွက် (လိုပါက)")} value={form.ward} onChangeText={value => update("ward", value)} maxLength={100} />
          <FormField label={t("Township or Area", "မြို့နယ် သို့မဟုတ် ဧရိယာ")} value={form.township} onChangeText={value => update("township", value)} maxLength={100} />
          <FormField label={t("City", "မြို့")} value={form.city} onChangeText={value => update("city", value)} maxLength={100} />
          <FormField label={t("Delivery Landmark and Instructions (Optional)", "အနီးရှိ အမှတ်အသားနှင့် မှာကြားချက် (လိုပါက)")} value={form.deliveryNote}
            onChangeText={value => update("deliveryNote", value)} maxLength={2000} multiline />
          <Body>{t("Contact phone is managed separately in your account details.", "ဆက်သွယ်ရန် ဖုန်းနံပါတ်ကို ပရိုဖိုင်တွင် ပြင်နိုင်ပါသည်။")}</Body>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Body>{t("Use as default address", "မူလလိပ်စာအဖြစ် သုံးရန်")}</Body>
            <Switch accessibilityLabel={t("Use as default address", "မူလလိပ်စာအဖြစ် သုံးရန်")} value={form.makeDefault} onValueChange={value => update("makeDefault", value)} />
          </View>
          {error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c" }}>{error}</Text> : null}
          <Action title={t("Review Address", "လိပ်စာ စစ်ဆေးရန်")} onPress={review} />
        </Card>
      </>}
      <Action title={address ? t("Cancel", "ပယ်ဖျက်ရန်") : t("Skip for Now", "ယခု ကျော်ရန်")} onPress={onCancel} secondary disabled={saving} />
      <Body>{t("Your precise location is saved privately to your account only after you confirm and save. Location services are never required to create an account.",
        "အတည်ပြုပြီး သိမ်းမှသာ သင့်တည်နေရာကို သင့်အကောင့်တွင် သိမ်းပါမည်။ အကောင့်ဖွင့်ရန် တည်နေရာအသုံးပြုခွင့် မလိုပါ။")}</Body>
    </Page>
    {mode === "map" && tenant.mapsConfigured ? <AddressMap language={language} selection={selection} locating={locating} notice={notice}
      onSelect={choosePin} onLocate={() => void locate()} onCancel={closeMap}
      onConfirm={() => { setSelection(confirmPin(selection)); setNotice(null); closeMap(); }} /> : null}
  </>;
}
