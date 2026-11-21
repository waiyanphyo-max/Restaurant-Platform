import { useEffect, useRef, useState } from "react";
import { ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { CustomerAddressResponse } from "@restaurant-platform/shared-types";
import { Switch, View } from "react-native";
import { getCustomerApi } from "../../api";
import { Action, Body, Card, FormField, Page, StateView, Status } from "../../components/ui";
import { LocationSelector, type LocationValidation } from "../../components/LocationSelector";
import { useCustomerLanguage, useCustomerText } from "../../i18n";
import { readEmbeddedTenant } from "../../tenant";
import { addressRequest, initialAddressForm, savedPin, validateAddress, type AddressForm } from "./address";
import { AddressMap } from "./AddressMap";
import { confirmPin, emptyPin, LocationSelectionError, selectPin, type Coordinates } from "./location";
import { suggestCurrentLocation } from "./native-location";
import { checkedAddresses } from "../profile/account";

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
  const [locationStatus, setLocationStatus] = useState<LocationValidation>("loading");
  const legacy = !!address && (!address.regionId || !address.districtId || !address.townshipId);
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [recovery, setRecovery] = useState<{ status: "checking" | "failed" | "review"; addresses: CustomerAddressResponse[]; matching: boolean } | null>(null);
  const requestGeneration = useRef(0);
  const active = useRef(true);
  const savingRef = useRef(false);
  const recoveryRequired = useRef(false);
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
    try {
      setSelection(selectPin(coordinates, "map"));
      setNotice(null);
      setError(null);
    } catch {
      setNotice(t("Choose a valid map location, or return to manual address entry.", "မှန်ကန်သောမြေပုံနေရာကို ရွေးပါ သို့မဟုတ် လိပ်စာကို စာဖြင့်ပြန်ဖြည့်ပါ။"));
    }
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
    const message = invalid ? t(invalid, "လိပ်စာအချက်အလက်နှင့် မြေပုံနေရာကို စစ်ဆေးပါ။")
      : locationStatus !== "valid" ? t("Choose and verify an active Region / State, District and Township before saving.", "အသုံးပြုနိုင်သော တိုင်းဒေသကြီး၊ ခရိုင်နှင့် မြို့နယ်ကို အတည်ပြုရွေးပါ။")
        : legacy && !legacyConfirmed ? t("Confirm that you have reviewed the new hierarchy against your original saved address.", "မူလလိပ်စာနှင့် နေရာအဆင့်ဆင့်ကို စစ်ဆေးပြီးကြောင်း အတည်ပြုပါ။") : null;
    setError(message);
    if (!message) setMode("review");
  }

  async function refreshAfterUncertainSave() {
    if (savingRef.current) return;
    setRecovery({ status: "checking", addresses: [], matching: false });
    mutation.current?.abort();
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const addresses = checkedAddresses(await getCustomerApi().listAddresses({ signal: controller.signal }));
      if (!active.current || controller.signal.aborted) return;
      const request = addressRequest(form, selection);
      const matching = addresses.some(item => (!address || item.id === address.id) &&
        Object.entries(request).every(([key, value]) => key === "makeDefault" ? !value || item.isDefault
          : key === "city" || key === "township" ? true : (item as unknown as Record<string, unknown>)[key] === value));
      setRecovery({ status: "review", addresses, matching });
    } catch {
      if (active.current && !controller.signal.aborted) setRecovery({ status: "failed", addresses: [], matching: false });
    }
  }

  async function save() {
    if (savingRef.current || recoveryRequired.current) return;
    const invalid = validateAddress(form, selection);
    if (invalid || locationStatus !== "valid" || legacy && !legacyConfirmed) { review(); setMode("details"); return; }
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
      const uncertain = cause instanceof ApiNetworkError || cause instanceof ApiTimeoutError || cause instanceof ApiProtocolError || cause instanceof ApiHttpError && cause.status >= 500;
      if (uncertain) {
        recoveryRequired.current = true;
        savingRef.current = false;
        setError(null);
        await refreshAfterUncertainSave();
      } else setError(denied ? t("Your session cannot save this address. Sign in again and retry.", "လိပ်စာသိမ်းရန် အကောင့် ပြန်ဝင်ပြီး ထပ်ကြိုးစားပါ။")
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
    <Page title={mode === "review" ? t("Save this address?", "ဤလိပ်စာကို သိမ်းမလား။") : legacy ? t("Review this saved address", "သိမ်းထားသောလိပ်စာ စစ်ဆေးရန်")
      : address ? t("Change Saved Address", "သိမ်းထားသော လိပ်စာ ပြင်ရန်") : t("Add a delivery address", "ပို့ဆောင်ရန်လိပ်စာ ထည့်ရန်")}
      subtitle={t("Use text details. Maps and GPS are optional.", "လိပ်စာကို စာဖြင့်ဖြည့်ပါ။ မြေပုံနှင့် GPS သည် မဖြစ်မနေ မလိုအပ်ပါ။")}>
      {recovery ? <Card title={t("Address save is not confirmed", "လိပ်စာသိမ်းမှုကို အတည်မပြုနိုင်သေးပါ")}>
        <Status tone="warning">{t("The response was lost. Reconnect, check your saved addresses before making another save.", "တုံ့ပြန်ချက် မရရှိပါ။ ထပ်မသိမ်းမီ အင်တာနက်ပြန်ချိတ်၍ သိမ်းထားသောလိပ်စာများကို စစ်ဆေးပါ။")}</Status>
        {recovery.status === "checking" ? <StateView kind="loading" title={t("Checking saved addresses…", "သိမ်းထားသောလိပ်စာများ စစ်ဆေးနေသည်…")} />
          : recovery.status === "failed" ? <StateView kind="offline" title={t("Saved addresses could not be checked", "သိမ်းထားသောလိပ်စာများကို စစ်ဆေး၍မရပါ")}
            message={t("Another save remains blocked until the owned address list is refreshed.", "သင့်အကောင့်၏ လိပ်စာစာရင်း ပြန်ရယူပြီးမှသာ ထပ်သိမ်းနိုင်ပါမည်။")}
            retryLabel={t("Refresh Saved Addresses", "သိမ်းထားသောလိပ်စာများ ပြန်ရယူရန်")} onRetry={() => void refreshAfterUncertainSave()} /> : <>
              <Body>{t("Review the refreshed address list:", "ပြန်ရယူထားသော လိပ်စာစာရင်းကို စစ်ဆေးပါ။")}</Body>
              {recovery.addresses.map(item => <Body key={item.id}>{item.label} · {[item.houseNo, item.street, item.ward, item.township, item.city].filter(Boolean).join(", ")}</Body>)}
              {!recovery.addresses.length ? <Body>{t("No saved addresses were returned.", "သိမ်းထားသောလိပ်စာ မရှိပါ။")}</Body> : null}
              {recovery.matching ? <Status>{t("A matching address is present. Review it in your saved addresses before making further changes.", "ကိုက်ညီသောလိပ်စာ ရှိပါသည်။ နောက်ထပ်မပြင်မီ သိမ်းထားသောလိပ်စာများတွင် စစ်ဆေးပါ။")}</Status>
                : <Action title={t("I checked the list — review another save", "စာရင်းစစ်ဆေးပြီးပါပြီ — ထပ်သိမ်းရန် စစ်ဆေးမည်")} secondary
                  onPress={() => { recoveryRequired.current = false; setRecovery(null); setMode("details"); }} />}
              <Action title={t("Refresh Saved Addresses", "သိမ်းထားသောလိပ်စာများ ပြန်ရယူရန်")} secondary onPress={() => void refreshAfterUncertainSave()} />
            </>}
        <Action title={t("Return to Saved Addresses", "သိမ်းထားသောလိပ်စာများသို့ ပြန်ရန်")} secondary onPress={onSaved} disabled={recovery.status === "checking"} />
      </Card> : null}
      {mode === "review" ? <Card title={t("Confirm Address Details", "လိပ်စာအချက်အလက် အတည်ပြုရန်")}>
        <Body>{form.label} · {form.recipientName || t("Recipient not provided", "လက်ခံသူအမည် မထည့်ထားပါ")}</Body>
        <Body>{[form.houseNo, form.street, form.ward, form.township, form.districtName, form.regionName || form.city].filter(Boolean).join(", ")}</Body>
        {form.recipientPhone ? <Body>{form.recipientPhone}</Body> : null}
        {form.deliveryNote ? <Body>{form.deliveryNote}</Body> : null}
        {coordinates ? <Body>{t("Confirmed pin", "အတည်ပြုထားသော နေရာ")} · {coordinates.latitude.toFixed(7)}, {coordinates.longitude.toFixed(7)}</Body>
          : <Body>{t("Text address without a map pin. Checkout requires address details, a selected Region / State, District and Township, and recipient contact information.",
            "မြေပုံနေရာမပါဘဲ လိပ်စာ သိမ်းထားပါသည်။ မှာယူရန် လမ်း၊ တိုက် သို့မဟုတ် ရပ်ကွက်အသေးစိတ်၊ ပို့ဆောင်နိုင်သော မြို့နှင့် မြို့နယ်၊ လက်ခံသူအမည်နှင့် ဖုန်းနံပါတ် လိုပါသည်။")}</Body>}
        <Body>{form.makeDefault ? t("Use as default address", "မူလလိပ်စာအဖြစ် သုံးရန်") : t("Keep existing default preference", "လက်ရှိ မူလလိပ်စာကို ဆက်သုံးရန်")}</Body>
        <Status>{t("For future orders. Saving this address does not change earlier order destinations. Delivery availability is checked at checkout.", "နောင်မှာယူမှုများအတွက် ဖြစ်ပါသည်။ ဤလိပ်စာသိမ်းခြင်းက ယခင်မှာယူမှု၏ ပို့ဆောင်လိပ်စာကို မပြောင်းပါ။ ပို့ဆောင်နိုင်မှုကို ငွေရှင်းချိန်တွင် စစ်ဆေးပါမည်။")}</Status>
        {error ? <Status tone="danger">{error}</Status> : null}
        <Action title={saving ? t("Saving Address…", "လိပ်စာ သိမ်းနေပါသည်…") : form.label.trim().toLowerCase() === "home"
          ? t("Save as Home Address", "အိမ်လိပ်စာအဖြစ် သိမ်းရန်") : t("Save Address", "လိပ်စာ သိမ်းရန်")}
          onPress={() => void save()} disabled={saving || !!recovery} />
        <Action title={t("Edit Address Details", "လိပ်စာအချက်အလက် ပြင်ရန်")} onPress={() => setMode("details")} secondary disabled={saving || !!recovery} />
      </Card> : <>
        <Card title={t("Address Details", "လိပ်စာ အချက်အလက်")}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t("Address label", "လိပ်စာအမည်")} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([["Home", "အိမ်"], ["Work", "အလုပ်"], ["Custom", "အခြား"]] as const).map(([label, my]) => <Action key={label} accessibilityRole="radio" title={t(label, my)}
              secondary={label === "Custom" ? ["Home", "Work"].includes(form.label) : form.label !== label}
              selected={label === "Custom" ? !["Home", "Work"].includes(form.label) : form.label === label}
              onPress={() => update("label", label === "Custom" ? "" : label)} />)}
          </View>
          <FormField label={t("Address Label", "လိပ်စာအမည်")} value={form.label} onChangeText={value => update("label", value)} maxLength={50} />
          <FormField label={t("Recipient Name (Optional)", "လက်ခံသူအမည် (လိုပါက)")} value={form.recipientName} onChangeText={value => update("recipientName", value)} maxLength={150} />
          <FormField label={t("Recipient Phone (Optional)", "လက်ခံသူ ဖုန်းနံပါတ် (လိုပါက)")} value={form.recipientPhone} onChangeText={value => update("recipientPhone", value)} maxLength={30} keyboardType="phone-pad" />
          {legacy ? <Card title={t("Original saved text", "မူလသိမ်းထားသော လိပ်စာစာသား")}>
            <Body>{[address.recipientName, address.recipientPhone].filter(Boolean).join(" · ")}</Body>
            <Body>{[address.houseNo, address.street, address.ward, address.township, address.districtName, address.city].filter(Boolean).join(", ")}</Body>
            {address.deliveryNote ? <Body>{address.deliveryNote}</Body> : null}
            <Status>{t("Your original address text is preserved. Choose the hierarchy explicitly; old text is never mapped automatically.", "မူလလိပ်စာစာသားကို ထိန်းသိမ်းထားပါသည်။ နေရာအဆင့်ဆင့်ကို ကိုယ်တိုင်ရွေးပါ။ စာသားမှ အလိုအလျောက် မခန့်မှန်းပါ။")}</Status>
          </Card> : null}
          <LocationSelector value={form} disabled={saving || !!recovery} onValidityChange={setLocationStatus} onChange={location => {
            setForm(previous => ({ ...previous, ...location, city: location.regionName })); setLegacyConfirmed(false); setError(null);
          }} />
          {legacy ? <View style={{ gap: 8 }}>
            <Body>{t("I reviewed the selected hierarchy against my original address.", "ရွေးထားသော နေရာအဆင့်ဆင့်ကို မူလလိပ်စာနှင့် စစ်ဆေးပြီးပါပြီ။")}</Body>
            <Switch accessibilityLabel={t("I reviewed the selected hierarchy against my original address.", "ရွေးထားသော နေရာအဆင့်ဆင့်ကို မူလလိပ်စာနှင့် စစ်ဆေးပြီးပါပြီ။")}
              hitSlop={12} value={legacyConfirmed} onValueChange={setLegacyConfirmed} disabled={locationStatus !== "valid" || saving || !!recovery} />
          </View> : null}
          <FormField label={t("Building, Floor or Room (Optional)", "တိုက်၊ အထပ် သို့မဟုတ် အခန်း (လိုပါက)")} value={form.houseNo} onChangeText={value => update("houseNo", value)} maxLength={50} multiline />
          <FormField label={t("Street or Detailed Address (Optional)", "လမ်း သို့မဟုတ် လိပ်စာအသေးစိတ် (လိုပါက)")} value={form.street} onChangeText={value => update("street", value)} maxLength={100} multiline />
          <FormField label={t("Ward or Neighborhood (Optional)", "ရပ်ကွက် (လိုပါက)")} value={form.ward} onChangeText={value => update("ward", value)} maxLength={100} multiline />
          <FormField label={t("Delivery Landmark and Instructions (Optional)", "အနီးရှိ အမှတ်အသားနှင့် မှာကြားချက် (လိုပါက)")} value={form.deliveryNote}
            onChangeText={value => update("deliveryNote", value)} maxLength={2000} multiline />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Body>{t("Use as default address", "မူလလိပ်စာအဖြစ် သုံးရန်")}</Body>
            <Switch hitSlop={12} accessibilityLabel={t("Use as default address", "မူလလိပ်စာအဖြစ် သုံးရန်")} value={form.makeDefault} onValueChange={value => update("makeDefault", value)} disabled={saving || !!recovery} />
          </View>
          {error ? <Status tone="danger">{error}</Status> : null}
          <Action title={t("Review Address", "လိပ်စာ စစ်ဆေးရန်")} onPress={review} disabled={saving || !!recovery} />
        </Card>
        <Card title={t("Delivery Location", "ပို့ဆောင်မည့်နေရာ")}>
          <Body>{t("Choose a map pin without granting GPS permission, or enter your address manually.",
            "GPS အသုံးပြုခွင့်မပေးဘဲ မြေပုံပေါ်တွင် နေရာရွေးနိုင်ပါသည်။ လိပ်စာကိုလည်း ကိုယ်တိုင် ဖြည့်နိုင်ပါသည်။")}</Body>
          {!tenant.mapsConfigured ? <Status tone="warning">
            {t("Google Maps is unavailable in this build. You can save a manual address or skip setup.",
              "ဤအက်ပ်တွင် Google Maps အသုံးမပြုနိုင်ပါ။ လိပ်စာကို ကိုယ်တိုင်ဖြည့်သိမ်းနိုင်ပါသည်။")}
          </Status> : null}
          <Action title={t("Choose Location on Map", "မြေပုံပေါ်တွင် နေရာရွေးရန်")} onPress={() => { setNotice(null); setMode("map"); }} disabled={!tenant.mapsConfigured || saving || !!recovery} />
          <Action title={t("Use My Current Location", "လက်ရှိတည်နေရာ သုံးရန်")} onPress={() => void locate()} disabled={!tenant.mapsConfigured || locating || saving || !!recovery} secondary />
          <Action title={t("Manual Address Entry", "လိပ်စာ ကိုယ်တိုင်ဖြည့်ရန်")} onPress={() => {
            setMode("details"); setNotice(t("Enter street, building or ward details below. A map pin is optional for saving and delivery checkout.",
              "အောက်တွင် လမ်း၊ တိုက် သို့မဟုတ် ရပ်ကွက်အသေးစိတ် ဖြည့်ပါ။ လိပ်စာသိမ်းရန်နှင့် ပို့ဆောင်မှုမှာယူရန် မြေပုံနေရာ မလိုအပ်ပါ။"));
          }} secondary disabled={saving || !!recovery} />
          {notice ? <Status>{notice}</Status> : null}
          {coordinates ? <>
            <Body>{selection.confirmed ? t("Confirmed location", "အတည်ပြုထားသော နေရာ")
              : t("Location selected — map confirmation required", "နေရာရွေးထားပါသည်။ မြေပုံပေါ်တွင် အတည်ပြုရန် လိုပါသည်။")} · {coordinates.latitude.toFixed(7)}, {coordinates.longitude.toFixed(7)}</Body>
            <Action title={t("Remove Location and Use Manual Address", "မြေပုံနေရာ ဖယ်ပြီး လိပ်စာ ကိုယ်တိုင်ဖြည့်ရန်")} secondary disabled={saving || !!recovery} onPress={() => {
              requestGeneration.current++; setSelection({ ...emptyPin }); setNotice(null); setError(null);
            }} />
          </> : <Body>{t("No map location selected.", "မြေပုံနေရာ မရွေးရသေးပါ။")}</Body>}
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
