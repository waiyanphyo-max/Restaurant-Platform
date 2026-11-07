import { View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Body } from "../../components/ui";
import { localize, type CustomerLanguage } from "../../i18n";
import { readEmbeddedTenant } from "../../tenant";
import { validCoordinates } from "./location";

export function DestinationPin({ latitude, longitude, language }: {
  latitude: number | null;
  longitude: number | null;
  language: CustomerLanguage;
}) {
  const title = localize(language, "Confirmed delivery pin", "အတည်ပြုထားသော ပို့ဆောင်မည့်နေရာ");
  if (latitude == null || longitude == null || !validCoordinates({ latitude, longitude })) return null;
  const coordinates = { latitude, longitude };
  return <>
    {readEmbeddedTenant().mapsConfigured ? <View style={{ height: 148, borderRadius: 8, overflow: "hidden" }}>
      <MapView key={`${latitude},${longitude}`} provider={PROVIDER_GOOGLE} style={{ flex: 1 }}
        initialRegion={{ ...coordinates, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
        accessibilityLabel={title} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false}
        pitchEnabled={false} showsUserLocation={false} showsMyLocationButton={false} toolbarEnabled={false}>
        <Marker coordinate={coordinates} title={title} />
      </MapView>
    </View> : null}
    <Body>{title} · {latitude.toFixed(7)}, {longitude.toFixed(7)}</Body>
  </>;
}
