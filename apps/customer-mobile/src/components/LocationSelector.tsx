import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { ApiNetworkError, ApiTimeoutError, createLocationApiClient } from "@restaurant-platform/api-client";
import type { GeoLocationDto, LocationSelection } from "@restaurant-platform/shared-types";
import { readEmbeddedTenant } from "../tenant";
import { useCustomerText } from "../i18n";
import { Action, Body, FormField, StateView, Status, useUiTheme } from "./ui";

export type LocationValidation = "loading" | "valid" | "incomplete" | "unavailable" | "error";

function useLocations(level: "regions" | "districts" | "townships", parent: string) {
  const [state, setState] = useState<{ key: string; data: GeoLocationDto[]; loading: boolean; error: boolean; offline?: boolean }>({ key: "", data: [], loading: false, error: false });
  const [retry, setRetry] = useState(0);
  const key = `${level}:${parent}`;
  useEffect(() => {
    const controller = new AbortController();
    if (level !== "regions" && !parent) { setState({ key, data: [], loading: false, error: false }); return; }
    setState({ key, data: [], loading: true, error: false });
    const tenant = readEmbeddedTenant();
    const api = createLocationApiClient({ baseUrl: tenant.apiBaseUrl, allowPrivateLanHttp: tenant.allowPrivateLanHttp });
    const request = level === "regions" ? api.getRegions({ signal: controller.signal })
      : level === "districts" ? api.getDistricts(parent, { signal: controller.signal }) : api.getTownships(parent, { signal: controller.signal });
    void request.then(data => { if (!controller.signal.aborted) setState({ key, data: data.filter(item => level === "regions" ||
      (level === "districts" ? item.regionId === parent : item.districtId === parent)), loading: false, error: false }); },
      cause => { if (!controller.signal.aborted) setState({ key, data: [], loading: false, error: true,
        offline: cause instanceof ApiNetworkError || cause instanceof ApiTimeoutError }); });
    return () => controller.abort();
  }, [key, level, parent, retry]);
  return { ...(state.key === key ? state : { data: [], loading: !!parent || level === "regions", error: false, offline: false }), retry: () => setRetry(value => value + 1) };
}

function Choice({ label, id, name, list, enabled, disabled, onChoose }: {
  label: string; id: string; name: string; list: ReturnType<typeof useLocations>; enabled: boolean; disabled: boolean;
  onChoose(item: GeoLocationDto): void;
}) {
  const t = useCustomerText();
  const { color } = useUiTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = list.data.find(item => item.id === id);
  const rows = list.data.filter(item => `${item.nameEn} ${item.nameMy ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.nameEn || name || t("Select", "ရွေးရန်")}`}
      accessibilityState={{ disabled: !enabled || disabled, expanded: open }} disabled={!enabled || disabled}
      onPress={() => { setSearch(""); setOpen(value => !value); }}
      style={{ gap: 8, padding: 16, minHeight: 88, borderWidth: 1, borderRadius: 12,
        backgroundColor: color.surface, borderColor: color.borderStrong }}>
      <Body style={{ fontSize: 14, fontWeight: "600" }}>{label} *</Body>
      <Body tone={!enabled ? "muted" : "neutral"}>{selected?.nameEn || name || (enabled ? t("Select", "ရွေးရန်") : t("Choose the parent location first", "အထက်အဆင့်နေရာကို ဦးစွာရွေးပါ"))}</Body>
    </Pressable>
    {enabled && list.loading ? <StateView kind="loading" title={t(`Loading ${label.toLowerCase()}…`, `${label} ရယူနေသည်…`)} /> : null}
    {enabled && list.error ? <StateView kind={list.offline ? "offline" : "error"}
      title={t(`Could not load ${label.toLowerCase()}.`, `${label} ရယူ၍မရပါ။`)}
      message={t("Your text details stay while this form is open. Reconnect and retry.", "ဤဖောင်ဖွင့်ထားစဉ် ဖြည့်ထားသောအချက်အလက်များ ရှိနေပါမည်။ အင်တာနက်ပြန်ချိတ်၍ ထပ်ကြိုးစားပါ။")}
      retryLabel={t(`Retry ${label.toLowerCase()}`, `${label} ပြန်ရယူရန်`)} onRetry={disabled ? undefined : list.retry} /> : null}
    {enabled && !list.loading && !list.error && !list.data.length ? <Status>{t(`No active ${label.toLowerCase()} available.`, `အသုံးပြုနိုင်သော ${label} မရှိပါ။`)}</Status> : null}
    {enabled && id && !list.loading && !list.error && !selected ? <Status tone="warning">{t("Choose an active location. The saved selection is no longer available under this parent.", "လက်ရှိအထက်အဆင့်နေရာအောက်တွင် အသုံးပြုနိုင်သောနေရာကို ပြန်ရွေးပါ။")}</Status> : null}
    {open && enabled && !list.loading && !list.error ? <>
      <FormField label={t(`Search ${label.toLowerCase()}`, `${label} ရှာရန်`)} value={search} onChangeText={setSearch} editable={!disabled} />
      {!rows.length && list.data.length ? <><Status>{t("No matching locations. Try another search or review the parent location.", "ကိုက်ညီသောနေရာ မတွေ့ပါ။ ရှာဖွေမှု သို့မဟုတ် အထက်အဆင့်နေရာကို စစ်ဆေးပါ။")}</Status>
        <Action title={t("Clear search", "ရှာဖွေမှု ရှင်းရန်")} secondary onPress={() => setSearch("")} /></> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 8 }}>
      {rows.map(item => <Action key={item.id} accessibilityRole="radio" title={`${item.nameEn}${item.nameMy ? ` · ${item.nameMy}` : ""}`}
        secondary={item.id !== id} selected={item.id === id} disabled={disabled} onPress={() => { onChoose(item); setOpen(false); }} />)}
      </View>
      <Body tone="muted">{t("Only active locations within the selected parent are listed.", "ရွေးထားသောအထက်အဆင့်နေရာအောက်ရှိ အသုံးပြုနိုင်သောနေရာများကိုသာ ပြထားပါသည်။")}</Body>
    </> : null}
  </View>;
}

/** Changing a parent clears descendants in the same state update. A map is optional. */
export function LocationSelector({ value, onChange, disabled = false, onValidityChange }: {
  value: LocationSelection; onChange(value: LocationSelection): void; disabled?: boolean; onValidityChange?(status: LocationValidation): void;
}) {
  const t = useCustomerText();
  const [notice, setNotice] = useState("");
  const regions = useLocations("regions", "");
  const regionActive = regions.data.some(item => item.id === value.regionId);
  const districts = useLocations("districts", regionActive ? value.regionId : "");
  const districtActive = regionActive && districts.data.some(item => item.id === value.districtId);
  const townships = useLocations("townships", districtActive ? value.districtId : "");
  const townshipActive = districtActive && townships.data.some(item => item.id === value.townshipId);
  const validation: LocationValidation = regions.error || districts.error || townships.error ? "error"
    : regions.loading || districts.loading || townships.loading ? "loading"
      : !value.regionId || !value.districtId || !value.townshipId ? "incomplete" : townshipActive ? "valid" : "unavailable";
  useEffect(() => { onValidityChange?.(validation); }, [onValidityChange, validation]);
  return <View style={{ gap: 12 }}>
    <Choice label={t("Region / State", "တိုင်းဒေသကြီး / ပြည်နယ်")} id={value.regionId} name={value.regionName} list={regions} enabled disabled={disabled}
      onChoose={item => { if (!regions.data.some(row => row.id === item.id)) return;
        setNotice(t("Region changed. District and Township have been cleared.", "တိုင်းဒေသကြီး ပြောင်းထားသဖြင့် ခရိုင်နှင့် မြို့နယ်ကို ရှင်းထားပါသည်။"));
        onChange({ regionId: item.id, regionName: item.nameEn, districtId: "", districtName: "", townshipId: "", township: "" }); }} />
    <Choice key={`district:${value.regionId}`} label={t("District", "ခရိုင်")} id={value.districtId} name={value.districtName} list={districts}
      enabled={regionActive} disabled={disabled} onChoose={item => { if (!districts.data.some(row => row.id === item.id && row.regionId === value.regionId)) return;
        setNotice(t("District changed. Township has been cleared.", "ခရိုင် ပြောင်းထားသဖြင့် မြို့နယ်ကို ရှင်းထားပါသည်။"));
        onChange({ ...value, districtId: item.id, districtName: item.nameEn, townshipId: "", township: "" }); }} />
    <Choice key={`township:${value.districtId}`} label={t("Township", "မြို့နယ်")} id={value.townshipId} name={value.township} list={townships}
      enabled={districtActive} disabled={disabled} onChoose={item => { if (!townships.data.some(row => row.id === item.id && row.districtId === value.districtId)) return;
        onChange({ ...value, townshipId: item.id, township: item.nameEn }); }} />
    {notice ? <Status>{notice}</Status> : null}
    {value.regionName ? <Body tone="muted">{[value.regionName, value.districtName, value.township].filter(Boolean).join(" → ")}</Body> : null}
  </View>;
}
