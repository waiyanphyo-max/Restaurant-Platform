import { describe, expect, it, vi } from "vitest";
import { customerConfirmationRedirect, parseCustomerConfirmationInput, completeCustomerConfirmation, type ConfirmationAuthPort } from "@restaurant-platform/restaurant-config/customer-confirmation";
import { captureCustomerConfirmationLink, takeCustomerConfirmationInput } from "./confirmation-link";

const scheme = "rp-cafe-one-customer-staging";
const tenant = { slug: "cafe-one", environment: "staging" as const, guestBaseUrl: "https://guest.cafeone.com", routing: { scheme } };
const hash = "synthetic-confirmation-hash-1234";
function auth(): ConfirmationAuthPort {
  return {
    verifyOtp: vi.fn(async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111", email_confirmed_at: "2026-11-16T00:00:00Z" } }, error: null })),
    signOut: vi.fn(async () => undefined),
  };
}

describe("customer email confirmation boundary", () => {
  it("captures only this tenant and environment's scheme, consumes once, and keeps credentials out of navigation", () => {
    const first = captureCustomerConfirmationLink(`${scheme}://email-confirmation?token_hash=${hash}&type=email`, scheme);
    expect(first).toMatch(/^\d+$/);
    expect(takeCustomerConfirmationInput()).toEqual({ kind: "token-hash", tokenHash: hash });
    expect(takeCustomerConfirmationInput()).toEqual({ kind: "invalid" });
    for (const href of ["rp-cafe-two-customer-staging://email-confirmation", "rp-cafe-one-customer://email-confirmation", "https://attacker.net/email-confirmation", `${scheme}://user:password@email-confirmation`, `${scheme}://email-confirmation/../orders`]) {
      expect(captureCustomerConfirmationLink(href, scheme)).toBeNull();
    }
    expect(captureCustomerConfirmationLink(`${scheme}://email-confirmation?result=returned`, scheme)).not.toBe(first);
    expect(takeCustomerConfirmationInput()).toEqual({ kind: "provider-return" });
  });
  it("uses a fixed native destination or the exact stable HTTPS callback", () => {
    expect(customerConfirmationRedirect(tenant)).toBe(`${scheme}://email-confirmation`);
    const callback = `${tenant.guestBaseUrl}/auth/customer-confirmation/staging/cafe-one`;
    expect(customerConfirmationRedirect(tenant, callback)).toBe(callback);
    for (const value of ["https://attacker.net", `${callback}?next=https://attacker.net`, callback.replace("cafe-one", "cafe-two"), callback.replace("staging", "production")]) {
      expect(() => customerConfirmationRedirect(tenant, value)).toThrow();
    }
    const tunnel = { ...tenant, guestBaseUrl: "https://temporary.trycloudflare.com" };
    expect(() => customerConfirmationRedirect(tunnel, `${tunnel.guestBaseUrl}/auth/customer-confirmation/staging/cafe-one`)).toThrow();
  });
  it("confirms an email using an isolated client and clears its local session", async () => {
    const port = auth();
    expect(await completeCustomerConfirmation(port, parseCustomerConfirmationInput(`${scheme}://email-confirmation?token_hash=${hash}&type=email`))).toBe("confirmed");
    expect(port.verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: hash, type: "email" });
    expect(port.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
  it("handles an expired verification without claiming success or retaining an isolated session", async () => {
    const port = auth(); port.verifyOtp = vi.fn(async () => { throw new Error("private auth provider details"); });
    expect(await completeCustomerConfirmation(port, { kind: "token-hash", tokenHash: hash })).toBe("invalid");
    expect(port.signOut).toHaveBeenCalledOnce();
  });
  it("never exchanges native PKCE codes, imports fragment sessions, or claims a token-free handoff verified", async () => {
    const port = auth();
    for (const suffix of ["?code=provider-code-1234", "?result=confirmed", "#access_token=private-token&refresh_token=private-refresh&type=signup"]) {
      expect(await completeCustomerConfirmation(port, parseCustomerConfirmationInput(`${scheme}://email-confirmation${suffix}`))).toBe("returned");
    }
    expect(port.verifyOtp).not.toHaveBeenCalled(); expect(port.signOut).not.toHaveBeenCalled();
  });
  it.each([
    "?error_code=otp_expired&error_description=private", "?code=a&code=b", "?result=confirmed&next=https://attacker.net",
    `?token_hash=${hash}&type=recovery`, `?token_hash=${hash}&type=invite`, `?token_hash=${hash}&type=email&code=ambiguous`,
    "?access_token=private", "?type=email", "", `?token_hash=${hash}&type=email#access_token=private`,
  ])("rejects invalid or unrelated auth input %s", suffix => {
    expect(parseCustomerConfirmationInput(`${scheme}://email-confirmation${suffix}`)).toEqual({ kind: "invalid" });
  });
});
