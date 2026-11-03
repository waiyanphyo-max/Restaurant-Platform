import { describe, expect, it } from "vitest";
import { procurementMoney, purchaseOccurrence, purchaseQuantity, purchaseTimestamp, purchaseWholeAmount } from "./procurement-format";

describe("procurement date and precision boundaries",()=>{
  it("preserves amounts beyond binary floating point precision",()=>{
    expect(procurementMoney("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(purchaseWholeAmount("9007199254740993")).toBe("9007199254740993");
    expect(purchaseWholeAmount("9223372036854775807")).toBe("9223372036854775807");
    expect(()=>purchaseWholeAmount("9223372036854775808")).toThrow();
    expect(()=>purchaseWholeAmount("0",true)).toThrow();
    expect(()=>purchaseWholeAmount("0.1")).toThrow();
  });
  it("derives the purchase date from the restaurant timezone independently of the timestamp offset",()=>{
    const now=new Date("2026-11-02T19:00:00Z");
    expect(purchaseOccurrence("2026-11-02T18:00:00Z","Asia/Bangkok",now)).toEqual({
      purchaseDate:"2026-11-03",purchasedAt:"2026-11-02T18:00:00Z"
    });
    expect(purchaseOccurrence("2026-11-02T18:00:00Z","Asia/Yangon",now).purchaseDate).toBe("2026-11-03");
    expect(purchaseOccurrence("2026-11-02T17:29:59Z","Asia/Yangon",now).purchaseDate).toBe("2026-11-02");
    expect(()=>purchaseOccurrence("2026-11-02T19:00:01Z","Asia/Bangkok",now)).toThrow("at or before");
  });
  it("keeps exact decimal quantities and explicit timestamp offsets",()=>{
    expect(purchaseQuantity("0.000001")).toBe("0.000001");
    expect(()=>purchaseQuantity("0")).toThrow();expect(()=>purchaseQuantity("0.0000001")).toThrow();
    expect(()=>purchaseTimestamp("2026-11-02T09:30:00")).toThrow();
    expect(()=>purchaseTimestamp("2026-02-29T09:30:00Z")).toThrow();
    expect(()=>purchaseTimestamp("2026-11-02T24:00:00Z")).toThrow();
    expect(purchaseTimestamp("2026-11-02T09:30:00.123456+06:30")).toBe("2026-11-02T09:30:00.123456+06:30");
  });
});
