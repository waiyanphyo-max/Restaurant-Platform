import { describe, expect, it } from "vitest";
import {
  authCallbackFailureMessage,
  parseAuthCallbackUrl,
  safeAuthErrorMessage,
  safeReturnTo,
} from "./flow";

describe("safeReturnTo", () => {
  it("accepts same-origin app paths and rejects open redirects or credentials", () => {
    expect(safeReturnTo("/workspace?restaurantId=123")).toBe("/workspace?restaurantId=123");
    expect(safeReturnTo("//attacker.example/path")).toBe("/workspace");
    expect(safeReturnTo("/..//attacker.example/path")).toBe("/workspace");
    expect(safeReturnTo("/workspace?access_token=not-a-real-token")).toBe("/workspace");
    expect(safeReturnTo("/auth/callback")).toBe("/workspace");
  });
});

describe("Supabase callback parsing", () => {
  it("reads a PKCE code and retains only a safe return path", () => {
    expect(parseAuthCallbackUrl("https://app.example/auth/callback?code=fake-code&next=%2Fworkspace%3FrestaurantId%3D123"))
      .toEqual({ kind: "code", code: "fake-code", type: "", next: "/workspace?restaurantId=123" });
  });

  it("reads an invitation token hash and an SDK session fragment", () => {
    expect(parseAuthCallbackUrl("https://app.example/auth/accept-invite?token_hash=fake-hash&type=invite"))
      .toEqual({ kind: "token-hash", tokenHash: "fake-hash", type: "invite", next: "/workspace" });
    expect(parseAuthCallbackUrl("https://app.example/auth/accept-invite#access_token=fake-access&refresh_token=fake-refresh&type=invite"))
      .toEqual({ kind: "session", accessToken: "fake-access", refreshToken: "fake-refresh", type: "invite", next: "/workspace" });
  });

  it("handles invalid and missing links without echoing provider details", () => {
    const invalid = parseAuthCallbackUrl("https://app.example/auth/accept-invite?error_code=otp_expired&error_description=private-detail");
    expect(invalid).toEqual({ kind: "error", errorCode: "otp_expired", next: "/workspace" });
    expect(authCallbackFailureMessage("invalid")).not.toContain("otp_expired");
    expect(authCallbackFailureMessage("missing")).toMatch(/incomplete/i);
    expect(parseAuthCallbackUrl("https://app.example/auth/callback").kind).toBe("missing");
    expect(safeAuthErrorMessage({ code: "invalid_credentials", message: "do not show raw provider text" })).toBe("The email or password is incorrect.");
  });
});
