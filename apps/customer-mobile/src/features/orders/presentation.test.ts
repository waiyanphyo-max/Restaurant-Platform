import { describe, expect, it, vi } from "vitest";
vi.mock("../../i18n", () => ({ localize: (language: string, en: string, my: string) => language === "en" ? en : my }));
import { orderAmount, orderStatusTone, paymentStatusLabel, statusLabel } from "./presentation";

describe("owned order presentation", () => {
  it("formats exact whole currency and rejects values that would need rounding", () => {
    expect(orderAmount(14500, "MMK", "en")).toBe("14,500 MMK");
    for (const amount of [1.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(orderAmount(amount, "MMK", "en")).toBe("—");
    expect(orderAmount(0, null, "en")).toBe("0");
  });
  it("never turns delivery or restaurant completion into a cash collection label", () => {
    expect(statusLabel("COMPLETED", "en")).toBe("Completed");
    expect(statusLabel("DELIVERED", "en")).toBe("Delivered");
    expect(paymentStatusLabel("CASH_ON_DELIVERY", "PENDING", "en")).toContain("not yet collected");
    expect(paymentStatusLabel("CASH_ON_DELIVERY", "PAID", "en")).toBe("Cash payment recorded");
    expect(paymentStatusLabel("OTHER", "PAID", "en")).toBe("Paid");
    expect(paymentStatusLabel("CASH_ON_DELIVERY", "PENDING", "my-MM")).toContain("မကောက်ခံရသေးပါ");
    expect(orderStatusTone("CANCELLED")).toBe("danger");
  });
});
