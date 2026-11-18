import { afterEach, describe, expect, it, vi } from "vitest";
import { customerPasswordPolicy, normalizeEmail, validEmail, validPassword } from "./validation";
afterEach(() => vi.unstubAllEnvs());
describe("customer credentials", () => {
  it("normalizes surrounding whitespace and case without stripping mailbox aliases", () => {
    expect(normalizeEmail(" Customer+Home@Example.Test ")).toBe("customer+home@example.test");
    expect(validEmail(" bad ")).toBe(false);
    expect(validEmail("user@example.test")).toBe(true);
    expect(validEmail("user name@example.test")).toBe(false);
  });
  it("keeps the existing eight-character minimum and honors stronger reviewed policy", () => {
    vi.stubEnv("EXPO_PUBLIC_CUSTOMER_PASSWORD_MIN_LENGTH", "12");
    vi.stubEnv("EXPO_PUBLIC_CUSTOMER_PASSWORD_REQUIREMENTS", "lower_upper_letters_digits_symbols");
    const policy = customerPasswordPolicy();
    expect(validPassword("long-password", policy)).toBe(false);
    expect(validPassword("Long-password1", policy)).toBe(true);
    expect(validPassword("Aa1!", policy)).toBe(false);
    expect(validPassword("Longpassword1 ", policy)).toBe(false);
    expect(validPassword("Longpassword1မြ", policy)).toBe(false);
    expect(validPassword("Longpassword1🙂", policy)).toBe(false);
  });
  it("counts Unicode code points for minimum length instead of UTF-16 units", () => {
    expect(validPassword("🙂🙂🙂🙂", { minimumLength: 8, requirements: "" })).toBe(false);
    expect(validPassword("🙂🙂🙂🙂🙂🙂🙂🙂", { minimumLength: 8, requirements: "" })).toBe(true);
  });
  it.each(["6", "bad", "129"])("rejects invalid minimum %s without weakening policy", value => {
    vi.stubEnv("EXPO_PUBLIC_CUSTOMER_PASSWORD_MIN_LENGTH", value);
    expect(() => customerPasswordPolicy()).toThrow("configuration");
  });
});
