import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { Action, Body } from "../../components/ui";
import { localize, type CustomerLanguage } from "../../i18n";
import { readEmbeddedTenant } from "../../tenant";
import type { Coordinates, PinSelection } from "./location";

const approximateYangonRegion: Region = { latitude: 16.8409, longitude: 96.1735, latitudeDelta: 0.08, longitudeDelta: 0.08 };

export function AddressMap({ selection, locating, notice, language = "en", onSelect, onConfirm, onCancel, onLocate }: {
  selection: PinSelection;
  locating: boolean;
  notice: string | null;
  language?: CustomerLanguage;
  onSelect(coordinates: Coordinates): void;
  onConfirm(): void;
  onCancel(): void;
  onLocate(): void;
}) {
  const tenant = readEmbeddedTenant();
  const t = (en: string, my: string) => localize(language, en, my);
  const map = useRef<MapView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const initial = useRef<Region>(selection.coordinates
    ? { ...selection.coordinates, latitudeDelta: 0.006, longitudeDelta: 0.006 }
    : tenant.initialMapRegion ?? approximateYangonRegion);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (selection.source === "gps" && selection.coordinates) {
      map.current?.animateToRegion({ ...selection.coordinates, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 300);
    }
  }, [selection]);

  return <Modal visible animationType="slide" onRequestClose={onCancel}>
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>{t("Choose your delivery entrance", "ပို့ဆောင်မည့် ဝင်ပေါက်ကို ရွေးပါ")}</Text>
      <Body>{t("Move the map, tap to place a pin, or drag the marker. Location permission is optional.",
        "မြေပုံရွှေ့ပါ၊ နေရာကို နှိပ်ရွေးပါ သို့မဟုတ် အမှတ်ကို ဆွဲရွှေ့ပါ။ တည်နေရာအသုံးပြုခွင့် ပေးရန် မလိုအပ်ပါ။")}</Body>
      {!selection.coordinates && !tenant.initialMapRegion ? <Body>{t("The initial view is an approximate Yangon region. Move to your area.",
        "မြေပုံတွင် ရန်ကုန်အနီးတစ်ဝိုက်ကို စတင်ပြသထားပါသည်။ သင့်နေရာသို့ ရွှေ့ပါ။")}</Body> : null}
      <View style={styles.mapContainer}>
        <MapView ref={map} style={styles.map} provider={PROVIDER_GOOGLE}
          initialRegion={initial.current} showsUserLocation={false} showsMyLocationButton={false}
          toolbarEnabled={false} onMapLoaded={() => setLoaded(true)}
          onPress={event => onSelect(event.nativeEvent.coordinate)}>
          {selection.coordinates ? <Marker coordinate={selection.coordinates} draggable
            title={t("Your selected delivery location", "ရွေးထားသော ပို့ဆောင်မည့်နေရာ")} onDragEnd={event => onSelect(event.nativeEvent.coordinate)} /> : null}
        </MapView>
      </View>
      {!loaded && !slow ? <ActivityIndicator accessibilityLabel={t("Loading Google Maps", "Google Maps ဖွင့်နေပါသည်")} /> : null}
      {slow && !loaded ? <Text accessibilityRole="alert" style={styles.notice}>{t("Google Maps has not loaded. Check your connection or return to manual address entry.",
        "Google Maps မဖွင့်နိုင်သေးပါ။ အင်တာနက် စစ်ဆေးပါ သို့မဟုတ် လိပ်စာဖြည့်ရန် ပြန်သွားပါ။")}</Text> : null}
      <Text style={styles.hint}>{t("If the map is blank, return to manual entry. Maps access requires a valid key and network connection.",
        "မြေပုံ မပေါ်ပါက လိပ်စာဖြည့်ရန် ပြန်သွားပါ။ Google Maps အသုံးပြုရန် အင်တာနက် လိုအပ်ပါသည်။")}</Text>
      {selection.coordinates ? <Text selectable style={styles.coordinates}>
        {t("Latitude", "လတ္တီတွဒ်")} {selection.coordinates.latitude.toFixed(7)} · {t("Longitude", "လောင်ဂျီတွဒ်")} {selection.coordinates.longitude.toFixed(7)}
      </Text> : <Body>{t("No location selected. Tap the map to choose.", "နေရာ မရွေးရသေးပါ။ မြေပုံပေါ်တွင် နှိပ်ရွေးပါ။")}</Body>}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      <Action title={locating ? t("Finding your current location…", "လက်ရှိတည်နေရာ ရှာနေပါသည်…")
        : t("Use My Current Location", "လက်ရှိတည်နေရာ သုံးရန်")} onPress={onLocate} disabled={locating} secondary />
      <Action title={t("Confirm This Location", "ဤနေရာကို အတည်ပြုရန်")} onPress={onConfirm} disabled={!selection.coordinates || locating || !loaded} />
      <Action title={t("Return to Address Details", "လိပ်စာအချက်အလက်သို့ ပြန်သွားရန်")} onPress={onCancel} secondary />
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 10, paddingTop: 28, backgroundColor: "#f6f8fa" },
  title: { fontSize: 22, fontWeight: "700", color: "#18222e" },
  mapContainer: { flex: 1, minHeight: 160, borderRadius: 12, overflow: "hidden" },
  map: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  coordinates: { color: "#334155", fontSize: 13 },
  notice: { color: "#92400e", fontSize: 14, lineHeight: 20 },
  hint: { color: "#526174", fontSize: 12, lineHeight: 17 }
});
