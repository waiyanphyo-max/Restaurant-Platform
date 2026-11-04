export const TRAVEL_MODES = {
  Driving: "driving",
  Motorcycle: "two-wheeler",
  Bicycling: "bicycling",
  Walking: "walking",
  Transit: "transit"
} as const;
export type TravelMode = keyof typeof TRAVEL_MODES;
export type MapAction = "view" | "navigate";

type LocationInput = { latitude: unknown; longitude: unknown } | null | undefined;

export function validDeliveryCoordinates(location: LocationInput): location is { latitude: number; longitude: number } {
  return !!location && typeof location.latitude === "number" && Number.isFinite(location.latitude)
    && location.latitude >= -90 && location.latitude <= 90
    && typeof location.longitude === "number" && Number.isFinite(location.longitude)
    && location.longitude >= -180 && location.longitude <= 180;
}

export function deliveryMapUrl(location: LocationInput, action: MapAction, mode: TravelMode = "Driving") {
  if (!validDeliveryCoordinates(location)) return null;
  const pair = `${location.latitude.toFixed(7)},${location.longitude.toFixed(7)}`;
  const encoded = encodeURIComponent(pair);
  if (action === "view") {
    return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  }
  // Google Maps supplies the current origin from its own foreground location access.
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=${TRAVEL_MODES[mode]}&dir_action=navigate`;
}

export async function openDeliveryMap(
  openUrl: (url: string) => Promise<unknown>,
  location: LocationInput,
  action: MapAction,
  mode: TravelMode,
  signal: AbortSignal
): Promise<"opened" | "no-coordinates" | "unavailable" | "cancelled"> {
  const url = deliveryMapUrl(location, action, mode);
  if (!url) return "no-coordinates";
  if (signal.aborted) return "cancelled";
  try {
    // The Google Maps HTTPS URL works as an Android app link and a browser fallback.
    await openUrl(url);
    return "opened";
  } catch {
    return "unavailable";
  }
}
