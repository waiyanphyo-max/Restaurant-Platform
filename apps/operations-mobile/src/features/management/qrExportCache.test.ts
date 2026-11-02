import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///app/private/cache/", readDirectoryAsync: files.read, deleteAsync: files.remove }));
import { purgeStaleQrExports, QR_EXPORT_RETENTION_MS, releaseQrExport } from "./qrExportCache";

describe("sensitive QR export cache retention", () => {
  beforeEach(() => { files.read.mockReset(); files.remove.mockReset().mockResolvedValue(undefined); });
  afterEach(() => { vi.useRealTimers(); });
  it("purges only stale QR PNGs and keeps fresh exports and unrelated files", async () => {
    const now = 1800000000000;
    files.read.mockResolvedValue([`restaurant-qr-${now - QR_EXPORT_RETENTION_MS}.png`, `restaurant-qr-${now - 1}.png`, "other-image.png", "../restaurant-qr-1000000000000.png", "restaurant-qr-token.png", "restaurant-qr-1000000000000.png/subfile"]);
    await purgeStaleQrExports(now);
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(`file:///app/private/cache/restaurant-qr-${now - QR_EXPORT_RETENTION_MS}.png`, { idempotent: true });
  });
  it("retains a successfully shared PNG for five minutes before best-effort removal", async () => {
    vi.useFakeTimers();
    const path = "file:///app/private/cache/restaurant-qr-1800000000000.png";
    await releaseQrExport(path, true);
    expect(files.remove).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(QR_EXPORT_RETENTION_MS - 1);
    expect(files.remove).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(path, { idempotent: true });
  });
  it("removes failed exports immediately and refuses paths outside its own cache naming contract", async () => {
    await releaseQrExport("file:///app/private/cache/restaurant-qr-1800000000000.png", false);
    expect(files.remove).toHaveBeenCalledTimes(1);
    await releaseQrExport("file:///app/private/cache/other.png", false);
    await releaseQrExport("file:///other/restaurant-qr-1800000000000.png", false);
    await releaseQrExport("file:///app/private/cache/../restaurant-qr-1800000000000.png", false);
    expect(files.remove).toHaveBeenCalledTimes(1);
  });
});
