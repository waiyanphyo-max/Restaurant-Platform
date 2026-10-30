import { describe, expect, it } from "vitest";
import { readQrTokenFromHash } from "./qr-fragment";

describe("legacy QR fragment", () => {
  it("reads the encoded fragment without putting it in the query", () => {
    expect(readQrTokenFromHash("#qrToken=example%2Btoken")).toBe("example+token");
  });

  it("rejects missing or ambiguous credentials", () => {
    expect(readQrTokenFromHash("")).toBeNull();
    expect(readQrTokenFromHash("#qrToken=a&qrToken=b")).toBeNull();
  });
});
