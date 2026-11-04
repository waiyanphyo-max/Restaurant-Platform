import { describe, expect, it, vi } from "vitest";
import { deliveryMapUrl, openDeliveryMap, validDeliveryCoordinates } from "./delivery-maps";

const point = { latitude: 0, longitude: -96.1234567 };

describe("verified Google Maps stops", () => {
  it.each([
    { latitude: 0, longitude: 0 },
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 }
  ])("accepts zero and exact boundaries $latitude, $longitude", location => {
    expect(validDeliveryCoordinates(location)).toBe(true);
  });

  it.each([
    null, undefined, { latitude: null, longitude: 1 }, { latitude: 1, longitude: undefined },
    { latitude: NaN, longitude: 1 }, { latitude: 1, longitude: Infinity },
    { latitude: -90.00001, longitude: 0 }, { latitude: 0, longitude: 180.00001 },
    { latitude: "0", longitude: 0 }, { latitude: 1, longitude: "3&evil=1" }
  ])("rejects incomplete, non-finite, out-of-range and malformed coordinates (%j)", location => {
    expect(validDeliveryCoordinates(location)).toBe(false);
    expect(deliveryMapUrl(location, "navigate")).toBeNull();
  });

  it("generates a pin search and directions from the device location using numeric coordinates only", () => {
    expect(deliveryMapUrl(point, "view")).toBe("https://www.google.com/maps/search/?api=1&query=0.0000000%2C-96.1234567");
    const url = new URL(deliveryMapUrl(point, "navigate")!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api: "1", destination: "0.0000000,-96.1234567", travelmode: "driving", dir_action: "navigate"
    });
  });

  it.each([
    ["Motorcycle", "two-wheeler"],
    ["Bicycling", "bicycling"],
    ["Walking", "walking"],
    ["Transit", "transit"]
  ] as const)("maps %s to the supported Google Maps mode", (mode, urlMode) => {
    expect(new URL(deliveryMapUrl(point, "navigate", mode)!).searchParams.get("travelmode")).toBe(urlMode);
  });

  it("hands Android an HTTPS link its browser can handle without a Maps app", async () => {
    const open = vi.fn<(url: string) => Promise<void>>().mockResolvedValueOnce();
    await expect(openDeliveryMap(open, point, "navigate", "Driving", new AbortController().signal)).resolves.toBe("opened");
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://www.google.com/maps/dir/?api=1&destination=0.0000000%2C-96.1234567&travelmode=driving&dir_action=navigate"
    );
  });

  it("reports a safe error when Maps and browser both fail", async () => {
    const open = vi.fn().mockRejectedValue(new Error("No handler"));
    await expect(openDeliveryMap(open, point, "navigate", "Walking", new AbortController().signal)).resolves.toBe("unavailable");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not launch an invalid location or open a link after cancellation", async () => {
    const controller = new AbortController();
    const open = vi.fn();
    await expect(openDeliveryMap(open, null, "view", "Driving", controller.signal)).resolves.toBe("no-coordinates");
    controller.abort();
    await expect(openDeliveryMap(open, point, "navigate", "Driving", controller.signal)).resolves.toBe("cancelled");
    expect(open).not.toHaveBeenCalled();
  });
});
