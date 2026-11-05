import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireCurrentLocation, confirmPin, emptyPin, selectPin, validCoordinates, type LocationPort } from "./location";

const point = { latitude: 16.8409, longitude: 96.1735 };
const setup = (): LocationPort => ({
  servicesEnabled: vi.fn().mockResolvedValue(true),
  requestForegroundPermission: vi.fn().mockResolvedValue(true),
  currentPosition: vi.fn().mockResolvedValue({ coords: { ...point, accuracy: 12 } })
});

describe("explicit map pin confirmation", () => {
  it("allows a map pin without consulting GPS and requires confirmation", () => {
    const location = setup();
    const selected = selectPin(point, "map");
    expect(selected.confirmed).toBe(false);
    expect(confirmPin(selected)).toEqual({ coordinates: point, confirmed: true, source: "map" });
    expect(location.requestForegroundPermission).not.toHaveBeenCalled();
    expect(location.currentPosition).not.toHaveBeenCalled();
  });

  it("invalidates confirmation after a marker drag or tap selects a new location", () => {
    const confirmed = confirmPin(selectPin(point, "map"));
    const dragged = selectPin({ ...confirmed.coordinates!, latitude: 17 }, "map");
    expect(dragged.confirmed).toBe(false);
    expect(dragged.coordinates?.latitude).toBe(17);
    expect(confirmed.coordinates).toEqual(point);
  });

  it("does not allow an empty or invalid selection to be confirmed", () => {
    expect(() => confirmPin(emptyPin)).toThrow("Choose a location");
    expect(() => selectPin({ latitude: 91, longitude: 0 }, "map")).toThrow("coordinate range");
  });

  it.each([
    [{ latitude: -90, longitude: -180 }, true],
    [{ latitude: 90, longitude: 180 }, true],
    [{ latitude: 0, longitude: 0 }, true],
    [{ latitude: -90.001, longitude: 0 }, false],
    [{ latitude: 90.001, longitude: 0 }, false],
    [{ latitude: 0, longitude: -180.001 }, false],
    [{ latitude: 0, longitude: 180.001 }, false],
    [{ latitude: Number.NaN, longitude: 0 }, false],
    [{ latitude: 0, longitude: Number.POSITIVE_INFINITY }, false]
  ])("validates coordinate bounds and finite values: %j", (coordinates, expected) => {
    expect(validCoordinates(coordinates)).toBe(expected);
  });
});

describe("one-time foreground GPS suggestions", () => {
  afterEach(() => vi.useRealTimers());

  it("requests permission only when explicitly invoked and returns an unconfirmed suggestion", async () => {
    const port = setup();
    expect(port.requestForegroundPermission).not.toHaveBeenCalled();
    const result = await acquireCurrentLocation(port);
    expect(port.requestForegroundPermission).toHaveBeenCalledTimes(1);
    expect(port.currentPosition).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ coordinates: point, accuracyWarning: null });
    expect(selectPin(result.coordinates, "gps").confirmed).toBe(false);
  });

  it("does not read GPS when permission is denied and manual pins still work", async () => {
    const port = setup();
    vi.mocked(port.requestForegroundPermission).mockResolvedValue(false);
    await expect(acquireCurrentLocation(port)).rejects.toMatchObject({ code: "denied" });
    expect(port.currentPosition).not.toHaveBeenCalled();
    expect(confirmPin(selectPin(point, "map")).coordinates).toEqual(point);
  });

  it("does not request permission or GPS if services are disabled", async () => {
    const port = setup();
    vi.mocked(port.servicesEnabled).mockResolvedValue(false);
    await expect(acquireCurrentLocation(port)).rejects.toMatchObject({ code: "unavailable" });
    expect(port.requestForegroundPermission).not.toHaveBeenCalled();
    expect(port.currentPosition).not.toHaveBeenCalled();
  });

  it("reports timeout and clears the timer without starting another location request", async () => {
    vi.useFakeTimers();
    const port = setup();
    vi.mocked(port.currentPosition).mockImplementation(() => new Promise(() => {}));
    const result = acquireCurrentLocation(port);
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
    expect(port.currentPosition).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("normalizes provider errors without exposing raw GPS data", async () => {
    const port = setup();
    vi.mocked(port.currentPosition).mockRejectedValue(new Error("native provider debug coordinates"));
    await expect(acquireCurrentLocation(port)).rejects.toMatchObject({ code: "unavailable" });
    await expect(acquireCurrentLocation(port)).rejects.not.toThrow("debug coordinates");
  });

  it.each([null, Number.NaN, -1, 101, 5000])("warns about unknown or low accuracy: %s", async accuracy => {
    const port = setup();
    vi.mocked(port.currentPosition).mockResolvedValue({ coords: { ...point, accuracy } });
    const result = await acquireCurrentLocation(port);
    expect(result.accuracyWarning).toMatch(/Adjust the pin/);
    expect(selectPin(result.coordinates, "gps").confirmed).toBe(false);
  });

  it("rejects impossible coordinates from the device", async () => {
    const port = setup();
    vi.mocked(port.currentPosition).mockResolvedValue({ coords: { latitude: 100, longitude: 0, accuracy: 1 } });
    await expect(acquireCurrentLocation(port)).rejects.toMatchObject({ code: "invalid" });
  });
});
