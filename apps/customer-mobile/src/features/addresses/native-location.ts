import * as Location from "expo-location";
import { acquireCurrentLocation, type LocationPort } from "./location";

const foregroundLocation: LocationPort = {
  servicesEnabled: () => Location.hasServicesEnabledAsync(),
  async requestForegroundPermission() {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.granted;
  },
  currentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
};

export function suggestCurrentLocation() {
  return acquireCurrentLocation(foregroundLocation);
}
