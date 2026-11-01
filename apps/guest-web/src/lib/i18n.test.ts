import { describe, expect, it } from "vitest";
import { guestLocales, messages, parseGuestLocale } from "./i18n";

describe("guest localization structure", () => {
  it("provides complete, nonempty English and Burmese dictionaries for the same UI states", () => {
    expect([...guestLocales]).toEqual(["en", "my"]);
    expect(Object.keys(messages.my).sort()).toEqual(Object.keys(messages.en).sort());
    for (const locale of guestLocales) {
      for (const value of Object.values(messages[locale])) {
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
    for (const value of Object.values(messages.my)) expect(value).toMatch(/[\u1000-\u109f]/u);
  });

  it("supports both selected languages and falls back to English for untrusted values without coercion", () => {
    expect(parseGuestLocale("en")).toBe("en");
    expect(parseGuestLocale("my")).toBe("my");
    for (const value of [undefined, null, "", "MY", "my-MM", "fr", ["my"], 1, { toString: () => { throw new Error("Do not coerce untrusted input"); } }]) {
      expect(parseGuestLocale(value)).toBe("en");
    }
  });
});
