import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  cacheDirectory: "file:///private-cache/", EncodingType: { UTF8: "utf8" },
  readDirectoryAsync: vi.fn<(path: string) => Promise<string[]>>(),
  writeAsStringAsync: vi.fn<(path: string, text: string, options: { encoding: string }) => Promise<void>>(),
  deleteAsync: vi.fn<(path: string, options: { idempotent: boolean }) => Promise<void>>()
}));
const sharing = vi.hoisted(() => ({ isAvailableAsync: vi.fn<() => Promise<boolean>>(), shareAsync: vi.fn<(path: string) => Promise<void>>() }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-file-system/legacy", () => fs);
vi.mock("expo-sharing", () => sharing);

import { shareAccountingCsv } from "./accounting-csv-file";

describe("private accounting CSV exports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T08:00:00Z"));
    fs.readDirectoryAsync.mockResolvedValue([]);
    fs.writeAsStringAsync.mockResolvedValue();
    fs.deleteAsync.mockResolvedValue();
    sharing.isAvailableAsync.mockResolvedValue(true);
    sharing.shareAsync.mockResolvedValue();
  });
  afterEach(() => vi.useRealTimers());

  it("purges only stale accounting exports and expires the privately shared report", async () => {
    const old = `purchase-history-${Date.now() - 300_000}.csv`;
    const fresh = `accounting-sales-ledger-${Date.now() - 1}-xyz.csv`;
    fs.readDirectoryAsync.mockResolvedValue([old, fresh, "unrelated.csv"]);
    expect(await shareAccountingCsv("financial-summary", "metric,amount\r\n", () => true)).toBe(true);
    const [file, csv] = fs.writeAsStringAsync.mock.calls[0];
    expect(file).toMatch(/^file:\/\/\/private-cache\/accounting-financial-summary-/);
    expect(csv).toBe("metric,amount\r\n");
    expect(sharing.shareAsync.mock.calls[0][0]).toBe(file);
    expect(fs.deleteAsync).toHaveBeenCalledExactlyOnceWith(`${fs.cacheDirectory}${old}`, { idempotent: true });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fs.deleteAsync).toHaveBeenLastCalledWith(file, { idempotent: true });
  });

  it("removes an in-flight export when session access is lost during the write", async () => {
    let current = true;
    fs.writeAsStringAsync.mockImplementation(async () => { current = false; });
    expect(await shareAccountingCsv("sales-ledger", "order_id", () => current)).toBe(false);
    expect(sharing.shareAsync).not.toHaveBeenCalled();
    expect(fs.deleteAsync).toHaveBeenCalledExactlyOnceWith(fs.writeAsStringAsync.mock.calls[0][0], { idempotent: true });
  });

  it("writes no report file when the view has already lost access", async () => {
    expect(await shareAccountingCsv("purchase-history", "purchase_id", () => false)).toBe(false);
    expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });
});
