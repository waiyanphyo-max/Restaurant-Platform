import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { useUiTheme } from "../../components/ui";
import foodIcon from "../../../assets/uxi/food.png";

/** Public catalog media uses HTTPS without credentials or private query tokens. */
export function counterImageUrl(value: string | null | undefined): string | undefined {
  if (!value || value.length > 2000 || value.includes("\\") || /\s/u.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
    || !/^https:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password && !url.search && !url.hash ? url.href : undefined;
  } catch { return undefined; }
}

export function CounterProductMedia({ uri, label }: { uri: string | null | undefined; label: string }) {
  const url = counterImageUrl(uri);
  return <PhotoSlot key={url ?? "fallback"} url={url} label={label} />;
}

function PhotoSlot({ url, label }: { url: string | undefined; label: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const { color } = useUiTheme();
  const fallback = !url || state === "failed";
  return <View style={[styles.slot, { backgroundColor: color.surfaceMuted }]}>
    {fallback ? <Image source={foodIcon} accessible={false} style={[styles.icon, { tintColor: color.foregroundMuted }]} />
      : <Image source={{ uri: url }} resizeMode="cover" accessibilityLabel={label} style={styles.photo}
        onLoad={() => setState("ready")} onError={() => setState("failed")} />}
    {fallback ? <View accessible accessibilityLabel={`${label} · Photo unavailable · ဓာတ်ပုံ မရရှိပါ`} /> : null}
    {!fallback && state === "loading" ? <ActivityIndicator style={styles.loading} color={color.foregroundMuted} accessibilityLabel="Loading photo · ဓာတ်ပုံ ရယူနေသည်" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  slot: { width: 72, height: 72, flexShrink: 0, borderRadius: foundationTokens.radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  icon: { width: 24, height: 24 }, photo: { width: 72, height: 72 }, loading: { position: "absolute" }
});
