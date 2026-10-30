import { describe, expect, it } from "vitest";
import { resolveBrandTokens } from "./index.js";

describe("resolveBrandTokens", () => {
  it("selects readable text for light and dark restaurant colors", () => {
    expect(resolveBrandTokens({ displayName: "Test", primaryColor: "#ffffff" }).onPrimaryColor).toBe("#000000");
    expect(resolveBrandTokens({ displayName: "Test", primaryColor: "#000000" }).onPrimaryColor).toBe("#ffffff");
  });

  it("rejects unsafe color values", () => {
    expect(() => resolveBrandTokens({ displayName: "Test", primaryColor: "red; background:url(example)" })).toThrow();
  });
});
