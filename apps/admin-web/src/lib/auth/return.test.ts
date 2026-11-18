import { describe, expect, it, vi } from "vitest";
import { completeAuthReturn, invitationPasswordIssue, parseAuthReturn, pinInvitationPasswordAuth, updateInvitationPassword, type AuthReturnPort } from "./return";

const userId = "00000000-0000-4000-8000-000000000001";

function port(): AuthReturnPort {
  return {
    exchangeCodeForSession: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    verifyOtp: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    setSession: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    getClaims: vi.fn(async () => ({ data: { claims: { sub: userId } }, error: null })),
  };
}

function passwordPort() {
  return {
    ...port(),
    getUser: vi.fn(async () => ({ data: { user: { id: userId, email: "registered@example.test" } }, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
  };
}

describe("Supabase auth return", () => {
  it("exchanges a PKCE code and verifies the resulting subject", async () => {
    const auth = port();
    const input = parseAuthReturn("https://admin.example.test/auth/callback?code=one-time-code", "callback");
    expect(await completeAuthReturn(auth, input)).toBe(userId);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
  });

  it.each(["invite", "recovery"])("verifies an %s token hash on the owner setup route", async (type) => {
    const auth = port();
    const input = parseAuthReturn(`https://admin.example.test/auth/accept-invite?token_hash=hash&type=${type}`, "invitation");
    expect(await completeAuthReturn(auth, input)).toBe(userId);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type });
    expect(parseAuthReturn("https://admin.example.test/auth/accept-invite?token_hash=hash&type=email", "invitation"))
      .toEqual({ kind: "invalid" });
  });

  it("never treats an ambient session or an HTTP URL as an invitation", async () => {
    const auth = port();
    for (const href of [
      "https://admin.example.test/auth/accept-invite",
      "http://localhost:3000/auth/accept-invite?token_hash=hash&type=invite",
      "https://admin.example.test/auth/accept-invite#access_token=access&refresh_token=refresh",
    ]) {
      await expect(completeAuthReturn(auth, parseAuthReturn(href, "invitation"))).rejects.toThrow();
    }
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("supports a legacy implicit invitation fragment without redirecting to a query target", async () => {
    const auth = port();
    const input = parseAuthReturn("https://admin.example.test/auth/accept-invite#access_token=access&refresh_token=refresh&type=invite", "invitation");
    expect(await completeAuthReturn(auth, input)).toBe(userId);
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(parseAuthReturn("https://admin.example.test/auth/callback?next=https://evil.example", "callback"))
      .toEqual({ kind: "invalid" });
  });

  it("supports the existing-account recovery fragment", async () => {
    const auth = port();
    const input = parseAuthReturn("https://admin.example.test/auth/accept-invite#access_token=access&refresh_token=refresh&type=recovery", "invitation");
    expect(await completeAuthReturn(auth, input)).toBe(userId);
    expect(auth.setSession).toHaveBeenCalledOnce();
  });

  it("fails expired or already-used links even when another account has a session", async () => {
    const auth = port();
    auth.verifyOtp = vi.fn(async () => ({ data: { user: null }, error: { message: "Token has expired or is invalid" } }));
    await expect(completeAuthReturn(auth, { kind: "token-hash", tokenHash: "used", type: "invite" })).rejects.toThrow();
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it.each(["code", "token-hash", "legacy-session"] as const)("rejects an account switch after %s verification", async kind => {
    const auth = port();
    auth.getClaims = vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } }, error: null }));
    const inputs = {
      code: { kind: "code", code: "one-time-code" },
      "token-hash": { kind: "token-hash", tokenHash: "hash", type: "invite" },
      "legacy-session": { kind: "legacy-session", accessToken: "access", refreshToken: "refresh" },
    } as const;
    await expect(completeAuthReturn(auth, inputs[kind])).rejects.toThrow();
  });

  it("never falls back to an ambient session when a link exchange returns no identity", async () => {
    const auth = port();
    auth.verifyOtp = vi.fn().mockResolvedValue(undefined);
    await expect(completeAuthReturn(auth, { kind: "token-hash", tokenHash: "hash", type: "invite" })).rejects.toThrow();
    expect(auth.getClaims).not.toHaveBeenCalled();
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
    const auth = passwordPort();
    await updateInvitationPassword(auth, userId, "new-password");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "registered@example.test", password: "new-password" });
    expect(auth.getClaims).toHaveBeenCalledTimes(2);
    auth.updateUser = vi.fn(async () => ({ data: { user: { id: "different-user" } }, error: null }));
    await expect(updateInvitationPassword(auth, userId, "new-password")).rejects.toThrow();
  });

  it("never changes a password after the invitation session switches accounts", async () => {
    const auth = passwordPort();
    await expect(updateInvitationPassword(auth, "another-user", "new-password")).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a changed provider identity before changing the password", async () => {
    const auth = passwordPort();
    auth.getUser.mockResolvedValue({ data: { user: { id: "different-user", email: "other@example.test" } }, error: null });
    await expect(updateInvitationPassword(auth, userId, "new-password")).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not complete setup if fresh password authentication fails or changes identity", async () => {
    const auth = passwordPort();
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "different-user" } }, error: null });
    await expect(updateInvitationPassword(auth, userId, "new-password")).rejects.toThrow();
    auth.signInWithPassword.mockRejectedValue(new Error("provider unavailable"));
    await expect(updateInvitationPassword(auth, userId, "new-password")).rejects.toThrow();
  });

  it("validates password length and confirmation", () => {
    expect(invitationPasswordIssue("short", "short")).toContain("8 characters");
    expect(invitationPasswordIssue("new-password", "different")).toContain("do not match");
    expect(invitationPasswordIssue("new-password", "new-password")).toBeNull();
  });

  it("pins the password target when another browser tab changes the shared account", async () => {
    const otherId = "00000000-0000-4000-8000-000000000002";
    let sharedId = userId;
    const shared = {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: sharedId }, access_token: "invite-token", refresh_token: "invite-refresh" } }, error: null })),
      setSession: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
      updateUser: vi.fn(),
    };
    const isolated = {
      ...passwordPort(),
      setSession: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { user: { id: userId }, access_token: "password-token", refresh_token: "password-refresh" } }, error: null })),
    };
    isolated.getUser.mockImplementation(async () => {
      // This used to change the shared updateUser target after its identity check.
      sharedId = otherId;
      return { data: { user: { id: userId, email: "registered@example.test" } }, error: null };
    });
    const pinned = await pinInvitationPasswordAuth(shared, isolated, userId);
    await updateInvitationPassword(pinned, userId, "new-password");
    expect(sharedId).toBe(otherId);
    expect(shared.updateUser).not.toHaveBeenCalled();
    expect(isolated.updateUser).toHaveBeenCalledExactlyOnceWith({ password: "new-password" });
    expect(isolated.setSession).toHaveBeenCalledExactlyOnceWith({ access_token: "invite-token", refresh_token: "invite-refresh" });
    expect(shared.setSession).toHaveBeenCalledExactlyOnceWith({ access_token: "password-token", refresh_token: "password-refresh" });
  });

  it("rejects a shared account switch before pinning or an invalid pinned token", async () => {
    const shared = {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: "other" }, access_token: "token", refresh_token: "refresh" } }, error: null })),
      setSession: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    };
    const isolated = {
      ...passwordPort(),
      setSession: vi.fn(async () => ({ data: { user: { id: "other" } }, error: null })),
      getSession: shared.getSession,
    };
    await expect(pinInvitationPasswordAuth(shared, isolated, userId)).rejects.toThrow();
    expect(isolated.setSession).not.toHaveBeenCalled();
    shared.getSession.mockResolvedValue({ data: { session: { user: { id: userId }, access_token: "token", refresh_token: "refresh" } }, error: null });
    await expect(pinInvitationPasswordAuth(shared, isolated, userId)).rejects.toThrow();
    expect(isolated.updateUser).not.toHaveBeenCalled();
    expect(shared.setSession).not.toHaveBeenCalled();
  });
});
