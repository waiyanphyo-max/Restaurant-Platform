import { describe, expect, it } from "vitest";
import { coordinate, createGuestQrUrl, invitationEmail, isTeamRole, optionalText, requiredText, wholeAmount } from "./validation";

const restaurantId = "11111111-1111-4111-8111-111111111111";
describe("management validation and credential handling", () => {
  it("validates whole operational amounts without accepting unsafe integers or cents", () => {
    expect(wholeAmount(" 2500 ", "Fee")).toBe(2500);
    for (const value of ["", "-1", "1.5", "1e3", "9007199254740992"]) expect(() => wholeAmount(value, "Fee")).toThrow();
  });
  it("normalizes invitation addresses and forbids owner/platform role assignment", () => {
    expect(invitationEmail(" Team@Example.com ")).toBe("team@example.com");
    expect(() => invitationEmail("editable-profile-value")).toThrow();
    expect(isTeamRole("STAFF")).toBe(true);
    expect(isTeamRole("OWNER")).toBe(false);
    expect(isTeamRole("PLATFORM_ADMIN")).toBe(false);
  });
  it("validates supported profile and table fields", () => {
    expect(requiredText(" T1 ", 30, "Table")).toBe("T1");
    expect(optionalText(" ", 50, "Address")).toBeNull();
    expect(() => requiredText(" ", 30, "Table")).toThrow();
    expect(() => optionalText("x".repeat(51), 50, "Address")).toThrow();
    expect(coordinate("-90", 90, "Latitude")).toBe(-90);
    expect(coordinate("", 180, "Longitude")).toBeNull();
    expect(() => coordinate("91", 90, "Latitude")).toThrow();
  });
  it.each(["common", "table"] as const)("preserves legacy %s QR routes and keeps secrets out of queries", kind => {
    const url = new URL(createGuestQrUrl("https://guest.example.com", restaurantId, "random+token/value", kind));
    expect(url.pathname).toBe(kind === "common" ? "/" : "/workspace");
    expect(url.searchParams.get("view")).toBe(kind === "common" ? "customer-pickup" : "table-order");
    expect(url.searchParams.get("restaurantId")).toBe(restaurantId);
    expect(url.search).not.toContain("token");
    expect(new URLSearchParams(url.hash.slice(1)).get("qrToken")).toBe("random+token/value");
  });
  it.each(["http://guest.example.com", "https://user:password@guest.example.com", "https://guest.example.com/other", "https://guest.example.com?token=x", "javascript:alert(1)"])("rejects untrusted guest origin %s", origin => {
    expect(() => createGuestQrUrl(origin, restaurantId, "server-token", "common")).toThrow();
  });
});
