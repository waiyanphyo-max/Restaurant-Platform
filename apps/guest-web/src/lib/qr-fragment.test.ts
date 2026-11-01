import { describe, expect, it } from "vitest";
import { hasQrCredentialFragment, readQrTokenFromHash } from "./qr-fragment";

describe("legacy QR fragment", () => {
  it("reads the encoded fragment without putting it in the query", () => {
    expect(readQrTokenFromHash("#qrToken=example%2Btoken")).toBe("example+token");
  });

  it("rejects missing or ambiguous credentials", () => {
    expect(readQrTokenFromHash("")).toBeNull();
    expect(readQrTokenFromHash("#qrToken=a&qrToken=b")).toBeNull();
  });

  it("preserves contact and category deep links instead of treating page anchors as credentials", () => {
    for (const hash of ["", "#contact", "#our-menu", "#category-11111111-1111-4111-8111-111111111111"]) {
      expect(hasQrCredentialFragment(hash)).toBe(false);
    }
  });

  it("removes credential-bearing fragments even when empty, encoded or ambiguous", () => {
    for (const hash of ["#qrToken=", "#qrToken=a&qrToken=b", "#qr%54oken=example", "#qrToken=example%2Btoken"]) {
      expect(hasQrCredentialFragment(hash)).toBe(true);
    }
  });
});
