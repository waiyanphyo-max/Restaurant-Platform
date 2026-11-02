import { describe, expect, it } from "vitest";
import { procurementMoney, procurementPeriod, purchaseQuantity, purchaseTimestamp, purchaseWholeAmount } from "./procurement-format";

describe("procurement date and precision boundaries",()=>{
  it("preserves amounts beyond binary floating point precision",()=>{
    expect(procurementMoney("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(purchaseWholeAmount("9007199254740993")).toBe("9007199254740993");
    expect(purchaseWholeAmount("9223372036854775807")).toBe("9223372036854775807");
    expect(()=>purchaseWholeAmount("9223372036854775808")).toThrow();
    expect(()=>purchaseWholeAmount("0",true)).toThrow();
    expect(()=>purchaseWholeAmount("0.1")).toThrow();
  });
  it("uses actual calendar month ends and rejects rollover dates",()=>{
    expect(procurementPeriod("MONTH","","2028-02","","")).toEqual({from:"2028-02-01",to:"2028-02-29"});
    expect(procurementPeriod("MONTH","","2026-11","","")).toEqual({from:"2026-11-01",to:"2026-11-30"});
    expect(()=>procurementPeriod("DAY","2026-02-29","","","")).toThrow();
    expect(()=>procurementPeriod("RANGE","","","2026-11-02","2026-11-01")).toThrow();
  });
  it("keeps exact decimal quantities and explicit timestamp offsets",()=>{
    expect(purchaseQuantity("0.000001")).toBe("0.000001");
    expect(()=>purchaseQuantity("0")).toThrow();expect(()=>purchaseQuantity("0.0000001")).toThrow();
    expect(()=>purchaseTimestamp("2026-11-02T09:30:00")).toThrow();
    expect(purchaseTimestamp("2026-11-02T09:30:00.123456+06:30")).toBe("2026-11-02T09:30:00.123456+06:30");
  });
});
