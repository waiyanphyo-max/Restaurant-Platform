import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { Body, useUiTheme } from "./ui";
import { safeFoodImageUrl } from "./media";
import { useCustomerText } from "../i18n";
import foodIcon from "../../assets/uxi/food.png";

export function FoodMedia({ uri, label, hero = false }: { uri?: string | null; label: string; hero?: boolean }) {
  const url = safeFoodImageUrl(uri);
  // A new URL mounts a fresh slot. Late callbacks cannot poison its loading/error state.
  return <MediaSlot key={url ?? "fallback"} url={url} label={label} hero={hero} />;
}

function MediaSlot({ url, label, hero }: { url?: string; label: string; hero: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const { color } = useUiTheme();
  const t = useCustomerText();
  return <View style={[styles.slot, hero ? styles.hero : styles.thumbnail, { backgroundColor: color.surfaceMuted }]}>
    {url && state !== "failed" ? <Image source={{ uri: url }} resizeMode="cover" accessibilityLabel={label}
      style={styles.image} onLoad={() => setState("ready")} onError={() => setState("failed")} /> :
      <View style={styles.fallback} accessible accessibilityLabel={`${label} · ${t("Photo unavailable", "ဓာတ်ပုံ မရရှိပါ")}`}>
        <Image source={foodIcon} accessible={false} style={[styles.icon, { tintColor: color.foregroundMuted }]} />
        {hero ? <Body tone="muted">{t("Photo unavailable", "ဓာတ်ပုံ မရရှိပါ")}</Body> : null}
      </View>}
    {url && state === "loading" ? <ActivityIndicator style={styles.loading} color={color.foregroundMuted}
      accessibilityLabel={t("Loading photo", "ဓာတ်ပုံ ရယူနေသည်")} /> : null}
  </View>;
}

/** RuntimeBrandingProvider already validates runtime URLs and embedded logo sources. */
export function BrandLogo({ uri, label, size = 40 }: { uri?: string | null; label: string; size?: number }) {
  return uri ? <LogoSlot key={uri} uri={uri} label={label} size={size} /> : null;
}
function LogoSlot({ uri, label, size }: { uri: string; label: string; size: number }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <Image source={{ uri }} accessibilityLabel={label} resizeMode="contain"
    onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: foundationTokens.radius.sm }} />;
}

const styles = StyleSheet.create({
  slot: { borderRadius: foundationTokens.radius.md, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  thumbnail: { width: 80, aspectRatio: 1, flexShrink: 0 }, hero: { width: "100%", aspectRatio: 2 },
  fallback: { alignItems: "center", justifyContent: "center", padding: 8, gap: 8 },
  icon: { width: 24, height: 24 }, loading: { position: "absolute" },
  image: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" }
});
