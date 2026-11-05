export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PinSelection {
  coordinates: Coordinates | null;
  confirmed: boolean;
  source: "map" | "gps" | "saved" | null;
}

export const emptyPin: PinSelection = { coordinates: null, confirmed: false, source: null };

export function validCoordinates(value: Coordinates): boolean {
  return Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
    && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

/** Every selection, including GPS, requires a fresh customer confirmation. */
export function selectPin(coordinates: Coordinates, source: "map" | "gps"): PinSelection {
  if (!validCoordinates(coordinates)) throw new Error("The selected location is outside the supported coordinate range.");
  return { coordinates: { latitude: coordinates.latitude, longitude: coordinates.longitude }, source, confirmed: false };
}

export function confirmPin(selection: PinSelection): PinSelection {
  if (!selection.coordinates || !validCoordinates(selection.coordinates)) throw new Error("Choose a location before confirming.");
  return { ...selection, confirmed: true };
}

export interface LocationPort {
  servicesEnabled(): Promise<boolean>;
  requestForegroundPermission(): Promise<boolean>;
  currentPosition(): Promise<{ coords: Coordinates & { accuracy: number | null } }>;
}

export class LocationSelectionError extends Error {
  constructor(readonly code: "denied" | "unavailable" | "timeout" | "invalid") {
    const messages = {
      denied: "Location permission was denied. You can still choose a pin on the map or enter your address manually.",
      unavailable: "Current location is unavailable. Check location services, or choose a pin manually.",
      timeout: "Finding your location took too long. Try again or choose a pin manually.",
      invalid: "The device returned an unusable location. Choose a pin manually."
    };
    super(messages[code]);
    this.name = "LocationSelectionError";
  }
}

/** One foreground fix only; no location watcher or background permissions. */
export async function acquireCurrentLocation(port: LocationPort, timeoutMs = 15_000): Promise<{
  coordinates: Coordinates;
  accuracyWarning: string | null;
}> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!await port.servicesEnabled()) throw new LocationSelectionError("unavailable");
    if (!await port.requestForegroundPermission()) throw new LocationSelectionError("denied");
    const position = await Promise.race([
      port.currentPosition(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new LocationSelectionError("timeout")), timeoutMs);
      })
    ]);
    if (!validCoordinates(position.coords)) throw new LocationSelectionError("invalid");
    const { latitude, longitude, accuracy } = position.coords;
    return {
      coordinates: { latitude, longitude },
      accuracyWarning: accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100
        ? "This position has low or unknown accuracy. Adjust the pin to your delivery entrance before confirming."
        : null
    };
  } catch (error) {
    if (error instanceof LocationSelectionError) throw error;
    throw new LocationSelectionError("unavailable");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
