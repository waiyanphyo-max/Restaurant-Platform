import { describe, expect, it, vi } from "vitest";
import { completeAuthReturn, parseAuthReturn, updateInvitationPassword, type AuthReturnPort } from "./return";

const userId = "00000000-0000-4000-8000-000000000001";

function port(): AuthReturnPort {
  return {
    exchangeCodeForSession: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    setSession: vi.fn(async () => ({ error: null })),
    getClaims: vi.fn(async () => ({ data: { claims: { sub: userId } }, error: null })),
  };
}

describe("Supabase auth return", () => {
  it("exchanges a PKCE code and verifies the resulting subject", async () => {
    const auth = port();
    const input = parseAuthReturn("https://admin.example.test/auth/callback?code=one-time-code", "callback");
    expect(await completeAuthReturn(auth, input)).toBe(userId);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
  });

  it("verifies only an invitation token hash on the invitation route", async () => {
    const auth = port();
    const input = parseAuthReturn("https://admin.example.test/auth/accept-invite?token_hash=hash&type=invite", "invitation");
    expect(await completeAuthReturn(auth, input)).toBe(userId);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type: "invite" });
    expect(parseAuthReturn("https://admin.example.test/auth/accept-invite?token_hash=hash&type=email", "invitation"))
      .toEqual({ kind: "invalid" });
  });

  it("supports a legacy implicit invitation fragment without redirecting to a query target", async () => {
    const auth = port();
    const input = parseAuthReturn("https://admin.example.test/auth/accept-invite#access_token=access&refresh_token=refresh&type=invite", "invitation");
    expect(await completeAuthReturn(auth, input)).toBe(userId);
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(parseAuthReturn("https://admin.example.test/auth/callback?next=https://evil.example", "callback"))
      .toEqual({ kind: "invalid" });
  });

  it("rejects duplicate, mixed, and unverifiable credentials", async () => {
    const auth = port();
    const invalid = [
      "https://admin.example.test/auth/callback?code=a&code=b",
      "https://admin.example.test/auth/callback?code=a#access_token=x&refresh_token=y",
      "https://admin.example.test/auth/callback#access_token=x",
      "https://admin.example.test/auth/callback?access_token=x&refresh_token=y",
      "https://admin.example.test/auth/callback#access_token=x&refresh_token=y&type=invite&type=email",
    ];
    for (const href of invalid) {
      await expect(completeAuthReturn(auth, parseAuthReturn(href, "callback"))).rejects.toThrow();
    }
    auth.getClaims = vi.fn(async () => ({ data: null, error: { message: "invalid" } }));
    await expect(completeAuthReturn(auth, { kind: "existing-session" })).rejects.toThrow();
  });

  it("retains the verified UUID when setting an invitation password", async () => {
    const auth = { ...port(), updateUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) };
    await updateInvitationPassword(auth, userId, "new-password");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    auth.updateUser = vi.fn(async () => ({ data: { user: { id: "different-user" } }, error: null }));
    await expect(updateInvitationPassword(auth, userId, "new-password")).rejects.toThrow();
  });

  it("never changes a password after the invitation session switches accounts", async () => {
    const auth = { ...port(), updateUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) };
    await expect(updateInvitationPassword(auth, "another-user", "new-password")).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
