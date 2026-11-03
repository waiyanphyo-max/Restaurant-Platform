import { describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { FormValidationError, MutationGate, mutationError } from "./mutation";

describe("duplicate mutation gate", () => {
  it("rejects a second tap synchronously before React can render a disabled control", () => {
    const gate = new MutationGate();
    expect(gate.begin()).toBe(true);
    expect(gate.begin()).toBe(false);
    expect(gate.begin()).toBe(false);
    gate.end();
    expect(gate.begin()).toBe(true);
  });

  it("serializes an in-flight write and permits an explicit retry after failure", async () => {
    const gate = new MutationGate();
    let finish!: () => void;
    const write = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    async function submit(action = write) {
      if (!gate.begin()) return false;
      try { await action(); return true; }
      finally { gate.end(); }
    }
    const first = submit();
    expect(await submit()).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    finish();
    expect(await first).toBe(true);
    await expect(submit(vi.fn(async () => { throw new ApiNetworkError(); }))).rejects.toBeInstanceOf(ApiNetworkError);
    expect(await submit(vi.fn(async () => undefined))).toBe(true);
  });
});

describe("safe operational mutation feedback", () => {
  it("distinguishes expired authentication from a forbidden operation", () => {
    expect(mutationError(new MissingAccessTokenError())).toContain("Sign in again");
    expect(mutationError(new ApiHttpError(401, "TOKEN_EXPIRED"))).toContain("Sign in again");
    expect(mutationError(new ApiHttpError(403, "FORBIDDEN"))).toContain("permission");
    expect(mutationError(new ApiHttpError(403, "FORBIDDEN"))).not.toContain("Sign in");
  });

  it.each([new ApiNetworkError(), new ApiTimeoutError()])("warns that an uncertain network result may already have reached the server", error => {
    expect(mutationError(error)).toContain("may have reached the server");
    expect(mutationError(error)).toContain("Refresh");
  });

  it("gives refresh guidance for conflicts and missing records without claiming success", () => {
    expect(mutationError(new ApiHttpError(409, "INVALID_DELIVERY_STATUS_TRANSITION"))).toContain("Refresh");
    expect(mutationError(new ApiHttpError(404, "ORDER_NOT_FOUND"))).toContain("no longer available");
    expect(mutationError(new ApiHttpError(503, "STORAGE_NOT_CONFIGURED"))).toContain("not configured");
  });

  it("shows validated local form feedback without exposing raw server or exception payloads", () => {
    expect(mutationError(new FormValidationError("Enter a whole quantity."))).toBe("Enter a whole quantity.");
    const secret = "Bearer secret-token qr-credential database-password";
    expect(mutationError(new Error(secret))).not.toContain(secret);
    expect(mutationError(new ApiHttpError(500, "INTERNAL", [], secret))).not.toContain(secret);
    expect(mutationError(new ApiHttpError(400, "INVALID_PRODUCT_REQUEST", [], secret))).toContain("Check the entered values");
  });

  it("makes invitation configuration and identity failures actionable", () => {
    expect(mutationError(new ApiHttpError(503, "MEMBER_INVITATION_NOT_CONFIGURED"))).toContain("configure Supabase invitations");
    expect(mutationError(new ApiHttpError(409, "MEMBER_EMAIL_ALREADY_REGISTERED"))).toContain("verified account");
    for (const code of ["MEMBER_INVITATION_PROVIDER_ERROR", "MEMBER_INVITATION_INVALID_PROVIDER_RESPONSE", "MEMBER_INVITATION_PROFILE_MISSING"]) {
      expect(mutationError(new ApiHttpError(502, code))).toContain("Refresh the team before retrying");
    }
  });
});
