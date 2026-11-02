import { describe, expect, it } from "vitest";
import { exactTimestamp, isIsoDate, operationalAmount } from "./format";

describe("operational display boundaries", () => {
  it("never silently rounds an unsafe monetary amount or assumes a minor-unit scale", () => {
    expect(operationalAmount(1250)).toBe("1,250");
    expect(operationalAmount(Number.MAX_SAFE_INTEGER + 1)).toBe("Amount unavailable");
    expect(operationalAmount(Number.NaN)).toBe("Amount unavailable");
  });
  it("preserves exact server timestamp and offset rather than device timezone", () => {
    const timestamp = "2026-11-01T23:59:59.123456+06:30";
    expect(exactTimestamp(timestamp)).toBe(timestamp);
    expect(exactTimestamp("bad-date")).toBe("Timestamp unavailable");
  });
  it("rejects rollover calendar dates", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01"]) expect(isIsoDate(date)).toBe(false);
  });
});
