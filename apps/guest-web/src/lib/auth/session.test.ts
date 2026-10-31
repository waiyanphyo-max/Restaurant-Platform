import { describe, expect, it, vi } from "vitest";
import { AuthSessionFailure, createWebAuthSession, type WebAuthPort } from "./session";

const userId = "00000000-0000-4000-8000-000000000001";

function port(): WebAuthPort {
  return {
    signInWithPassword: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    getClaims: vi.fn(async () => ({ data: { claims: { sub: userId } }, error: null })),
    getSession: vi.fn(async () => ({
      data: { session: { user: { id: userId }, access_token: "verified-access-token" } },
      error: null,
    })),
  };
}

describe("web auth session lifecycle", () => {
  it("signs in by email and verifies the returned Auth UUID", async () => {
    const auth = port();
    const session = createWebAuthSession(auth);
    expect(await session.signInWithEmail(" user@example.test ", "password")).toBe(userId);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "user@example.test", password: "password" });
    expect(await session.restoreUserId()).toBe(userId);
    expect(await session.getVerifiedAccessToken()).toBe("verified-access-token");
  });

  it("fails closed on a mismatched Auth UUID and never forwards its token", async () => {
    const auth = port();
    auth.getClaims = vi.fn(async () => ({ data: { claims: { sub: "other-user" } }, error: null }));
    const session = createWebAuthSession(auth);
    await expect(session.signInWithEmail("user@example.test", "password"))
      .rejects.toBeInstanceOf(AuthSessionFailure);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await session.getVerifiedAccessToken()).toBeNull();
  });

  it("does not trust a cookie session without verified claims", async () => {
    const auth = port();
    auth.getClaims = vi.fn(async () => ({ data: null, error: { message: "expired" } }));
    const session = createWebAuthSession(auth);
    expect(await session.restoreUserId()).toBeNull();
    expect(await session.getVerifiedAccessToken()).toBeNull();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("signs out locally and reports failure without pretending to clear a session", async () => {
    const auth = port();
    const session = createWebAuthSession(auth);
    await session.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    auth.signOut = vi.fn(async () => ({ error: { message: "network" } }));
    await expect(session.signOut()).rejects.toBeInstanceOf(AuthSessionFailure);
  });

  it("obtains refreshed SDK tokens for each request and refuses expired sessions", async () => {
    const auth = port();
    const session = createWebAuthSession(auth);
    expect(await session.getVerifiedAccessToken()).toBe("verified-access-token");
    auth.getSession = vi.fn(async () => ({
      data: { session: { user: { id: userId }, access_token: "refreshed-access-token" } }, error: null,
    }));
    expect(await session.getVerifiedAccessToken()).toBe("refreshed-access-token");
    auth.getClaims = vi.fn(async () => ({ data: null, error: { message: "refresh failed" } }));
    expect(await session.restoreUserId()).toBeNull();
    expect(await session.getVerifiedAccessToken()).toBeNull();
  });
});
