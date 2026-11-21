import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { createLocationApiClient } from "@restaurant-platform/api-client";
import type { GeoLocationDto, LocationSelection } from "@restaurant-platform/shared-types";
import { readEmbeddedTenant } from "../tenant";
import { Action, Body, FormField } from "./ui";

function useLocations(level: "regions" | "districts" | "townships", parent: string) {
  const [state, setState] = useState<{ key: string; data: GeoLocationDto[]; loading: boolean; error: boolean }>({ key: "", data: [], loading: false, error: false });
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
    void request.then(data => { if (!controller.signal.aborted) setState({ key, data, loading: false, error: false }); },
      () => { if (!controller.signal.aborted) setState({ key, data: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [key, level, parent, retry]);
  return { ...(state.key === key ? state : { data: [], loading: !!parent || level === "regions", error: false }), retry: () => setRetry(value => value + 1) };
}

function Choice({ label, id, name, list, enabled, disabled, onChoose }: {
  label: string; id: string; name: string; list: ReturnType<typeof useLocations>; enabled: boolean; disabled: boolean;
  onChoose(item: GeoLocationDto): void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = list.data.find(item => item.id === id);
  const rows = list.data.filter(item => `${item.nameEn} ${item.nameMy ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <View style={{ gap: 8 }}>
    <Action title={`${label}: ${selected?.nameEn || name || "Select"}`} secondary disabled={!enabled || disabled}
      onPress={() => { setSearch(""); setOpen(value => !value); }} />
    {enabled && list.loading ? <Body>Loading {label.toLowerCase()}…</Body> : null}
    {enabled && list.error ? <><Text accessibilityRole="alert">Could not load {label.toLowerCase()}.</Text>
      <Action title={`Retry ${label.toLowerCase()}`} secondary onPress={list.retry} disabled={disabled} /></> : null}
    {enabled && !list.loading && !list.error && !list.data.length ? <Body>No active {label.toLowerCase()} available.</Body> : null}
    {enabled && !!id && !list.loading && !list.error && !selected ? <Body accessibilityRole="alert" tone="warning">The selected {label.toLowerCase()} is no longer active. Select a current location before applying new coverage.</Body> : null}
    {open && enabled && !list.loading && !list.error ? <>
      <FormField label={`Search ${label.toLowerCase()}`} value={search} onChangeText={setSearch} editable={!disabled} />
      {!rows.length && list.data.length ? <Body>No matching locations.</Body> : null}
      {rows.map(item => <Action key={item.id} title={`${item.nameEn}${item.nameMy ? ` · ${item.nameMy}` : ""}`}
        secondary={item.id !== id} selected={item.id === id} disabled={disabled} onPress={() => { onChoose(item); setOpen(false); }} />)}
    </> : null}
  </View>;
}

/** Changing a parent clears descendants in the same state update. A map is optional. */
export function LocationSelector({ value, onChange, disabled = false, onValidityChange }: {
  value: LocationSelection; onChange(value: LocationSelection): void; disabled?: boolean; onValidityChange?(valid: boolean): void;
}) {
  const regions = useLocations("regions", "");
  const districts = useLocations("districts", value.regionId);
  const townships = useLocations("townships", value.districtId);
  const valid = !regions.loading && !districts.loading && !townships.loading && !regions.error && !districts.error && !townships.error
    && regions.data.some(item => item.id === value.regionId)
    && districts.data.some(item => item.id === value.districtId && item.regionId === value.regionId)
    && townships.data.some(item => item.id === value.townshipId && item.districtId === value.districtId && item.regionId === value.regionId);
  useEffect(() => { onValidityChange?.(valid); }, [valid, onValidityChange]);
  return <View style={{ gap: 12 }}>
    <Choice label="Region / State" id={value.regionId} name={value.regionName} list={regions} enabled disabled={disabled}
      onChoose={item => onChange({ regionId: item.id, regionName: item.nameEn, districtId: "", districtName: "", townshipId: "", township: "" })} />
    <Choice key={`district:${value.regionId}`} label="District" id={value.districtId} name={value.districtName} list={districts}
      enabled={!!value.regionId} disabled={disabled} onChoose={item => onChange({ ...value, districtId: item.id, districtName: item.nameEn, townshipId: "", township: "" })} />
    <Choice key={`township:${value.districtId}`} label="Township" id={value.townshipId} name={value.township} list={townships}
      enabled={!!value.districtId} disabled={disabled} onChoose={item => onChange({ ...value, townshipId: item.id, township: item.nameEn })} />
  </View>;
}
