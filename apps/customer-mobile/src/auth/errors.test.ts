import { describe, expect, it, vi } from "vitest";
import { authErrorMetadata, authErrorText, logAuthFailure } from "./errors";
describe("safe Auth diagnostics", () => {
  it.each(["over_email_send_rate_limit", "over_request_rate_limit"])("explains %s", code => {
    expect(authErrorText({ code, status: 429 }, "signup")[0]).toContain("Wait at least one minute");
    expect(authErrorMetadata({ code, message: "secret" }).code).toBe(code);
  });
  it("distinguishes invalid credentials, confirmation, provider and network problems", () => {
    expect(authErrorText({ code: "invalid_credentials" }, "login")[0]).toContain("Check your email and password");
    expect(authErrorText({ code: "email_not_confirmed" }, "login")[0]).toContain("Confirm your email");
    expect(authErrorText({ code: "signup_disabled" }, "signup")[0]).toContain("unavailable");
    expect(authErrorText({ name: "AuthRetryableFetchError" }, "signup")[0]).toContain("connection");
    expect(authErrorText({ code: "weak_password" }, "signup")[0]).toContain("stronger");
  });
  it("does not include emails, passwords, tokens or raw provider text in development logs", () => {
    vi.stubGlobal("__DEV__", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logAuthFailure("signup", { code: "unexpected_failure", status: 500, message: "private@fixture.test password secret-jwt", access_token: "private-token" });
    expect(warn).toHaveBeenCalledWith("Customer Auth request failed", { operation: "signup", code: "unexpected_failure", status: 500, network: false });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|password|jwt/);
    expect(authErrorMetadata({ code: "secret-token-value", name: "private" }).code).toBe("unclassified");
    warn.mockRestore(); vi.unstubAllGlobals();
  });
  it("explains a rejected email recipient without exposing provider details or claiming delivery", () => {
    const text = authErrorText({ code: "email_address_not_authorized", status: 403,
      message: "private SMTP configuration and recipient" }, "signup");
    expect(text[0]).toContain("cannot send to this address");
    expect(text[0]).toContain("Contact the restaurant");
    expect(text.join(" ")).not.toContain("private SMTP");
  });
});
