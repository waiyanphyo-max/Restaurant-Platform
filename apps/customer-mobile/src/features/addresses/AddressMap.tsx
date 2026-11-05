import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { Action, Body } from "../../components/ui";
import { readEmbeddedTenant } from "../../tenant";
import type { Coordinates, PinSelection } from "./location";

const approximateYangonRegion: Region = { latitude: 16.8409, longitude: 96.1735, latitudeDelta: 0.08, longitudeDelta: 0.08 };

export function AddressMap({ selection, locating, notice, onSelect, onConfirm, onCancel, onLocate }: {
  selection: PinSelection;
  locating: boolean;
  notice: string | null;
  onSelect(coordinates: Coordinates): void;
  onConfirm(): void;
  onCancel(): void;
  onLocate(): void;
}) {
  const tenant = readEmbeddedTenant();
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
      <Text accessibilityRole="header" style={styles.title}>Choose your delivery entrance</Text>
      <Body>Move the map, tap to place a pin, or drag the marker. Location permission is optional.</Body>
      {!selection.coordinates && !tenant.initialMapRegion ? <Body>The initial view is an approximate Yangon region. Move to your area.</Body> : null}
      <View style={styles.mapContainer}>
        <MapView ref={map} style={styles.map} provider={PROVIDER_GOOGLE}
          initialRegion={initial.current} showsUserLocation={false} showsMyLocationButton={false}
          toolbarEnabled={false} onMapLoaded={() => setLoaded(true)}
          onPress={event => onSelect(event.nativeEvent.coordinate)}>
          {selection.coordinates ? <Marker coordinate={selection.coordinates} draggable
            title="Your selected delivery location" onDragEnd={event => onSelect(event.nativeEvent.coordinate)} /> : null}
        </MapView>
      </View>
      {!loaded && !slow ? <ActivityIndicator accessibilityLabel="Loading Google Maps" /> : null}
      {slow && !loaded ? <Text accessibilityRole="alert" style={styles.notice}>Google Maps has not loaded. Check your connection or return to manual address entry.</Text> : null}
      <Text style={styles.hint}>If the map is blank, return to manual entry. Maps access requires a valid key and network connection.</Text>
      {selection.coordinates ? <Text selectable style={styles.coordinates}>
        Latitude {selection.coordinates.latitude.toFixed(7)} · Longitude {selection.coordinates.longitude.toFixed(7)}
      </Text> : <Body>No location selected. Tap the map to choose.</Body>}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      <Action title={locating ? "Finding your current location…" : "Use My Current Location"} onPress={onLocate} disabled={locating} secondary />
      <Action title="Confirm This Location" onPress={onConfirm} disabled={!selection.coordinates || locating || !loaded} />
      <Action title="Return to Address Details" onPress={onCancel} secondary />
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
