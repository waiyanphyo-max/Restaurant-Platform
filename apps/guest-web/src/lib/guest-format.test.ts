import { afterEach, describe, expect, it, vi } from "vitest";
import { formatGuestNumber } from "./guest-format";
import { formatMenuPrice } from "./menu";

afterEach(() => { vi.unstubAllGlobals(); });

describe("deterministic Guest number formatting", () => {
  it.each([
    [0, "0", "၀"],
    [1, "1", "၁"],
    [10, "10", "၁၀"],
    [999, "999", "၉၉၉"],
    [1000, "1,000", "၁,၀၀၀"],
    [1234567, "1,234,567", "၁,၂၃၄,၅၆၇"],
    [Number.MAX_SAFE_INTEGER, "9,007,199,254,740,991", "၉,၀၀၇,၁၉၉,၂၅၄,၇၄၀,၉၉၁"],
  ] as const)("formats the exact integer %s identically across server/client runtimes", (value, english, burmese) => {
    expect(formatGuestNumber(value, "en")).toBe(english);
    expect(formatGuestNumber(value, "my")).toBe(burmese);
  });

  it("uses explicit Burmese digits for menu counts and whole-currency prices", () => {
    expect(formatGuestNumber(1234)).toBe("1,234");
    expect(formatGuestNumber(2, "my")).toBe("၂");
    expect(formatMenuPrice(3000, "MMK", "my")).toBe("MMK\u00a0၃,၀၀၀");
    expect(formatMenuPrice(3000, "MMK", "en")).toBe("MMK\u00a03,000");
    expect(formatMenuPrice(1725, "USD", "my")).toBe("USD\u00a0၁,၇၂၅");
    expect(formatMenuPrice(1725, "USD", "en")).toBe("USD\u00a01,725");
    expect(formatMenuPrice(3000, "", "my")).toBe("၃,၀၀၀");
    expect(formatMenuPrice(3000, "", "en")).toBe("3,000");
  });

  it.each([1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])("refuses non-whole or inexact numeric input %s", value => {
    expect(() => formatGuestNumber(value, "en")).toThrow(RangeError);
    expect(() => formatGuestNumber(value, "my")).toThrow(RangeError);
  });

  it("keeps maximum safe whole-currency values exact without dividing or rounding", () => {
    expect(formatMenuPrice(Number.MAX_SAFE_INTEGER, "MMK", "en")).toBe("MMK\u00a09,007,199,254,740,991");
    expect(formatMenuPrice(Number.MAX_SAFE_INTEGER, "MMK", "my")).toBe("MMK\u00a0၉,၀၀၇,၁၉၉,၂၅၄,၇၄၀,၉၉၁");
    expect(formatMenuPrice(0, "MMK", "my")).toBe("MMK\u00a0၀");
  });

  it.each(["missing", "throws", "locale-fallback"] as const)("does not depend on Intl.NumberFormat when it is %s", mode => {
    const NumberFormat = vi.fn().mockImplementation(() => {
      if (mode === "throws") throw new Error("Locale data unavailable");
      return { format: () => "MMK3,000", resolvedOptions: () => ({ locale: "en" }) };
    });
    vi.stubGlobal("Intl", mode === "missing" ? undefined : { NumberFormat });
    expect(formatGuestNumber(1234567, "my")).toBe("၁,၂၃၄,၅၆၇");
    expect(formatGuestNumber(1234567, "en")).toBe("1,234,567");
    expect(formatMenuPrice(3000, "MMK", "my")).toBe("MMK\u00a0၃,၀၀၀");
    expect(formatMenuPrice(3000, "MMK", "en")).toBe("MMK\u00a03,000");
    expect(NumberFormat).not.toHaveBeenCalled();
  });
});
