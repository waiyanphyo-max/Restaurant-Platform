import { describe, expect, it, vi } from "vitest";
import {
  createNativeSessionController,
  NativeAuthError,
  type AppLifecyclePort,
  type NativeAuthPort,
  type NativeSession
} from "./session";

const firstUser = "b99e736d-e6a2-4510-b1e1-7460e16f5421";
const secondUser = "8254982b-7f82-413b-8c98-d26f558f4968";

function session(userId = firstUser, token = "access-token", expiresAt = 2_000): NativeSession {
  return { user: { id: userId }, access_token: token, expires_at: expiresAt };
}

function setup(initial: NativeSession | null, clock = () => 1_000_000) {
  let current = initial;
  let authListener: (value: NativeSession | null) => void = () => {};
  let appListener: (state: string) => void = () => {};
  const removeAppListener = vi.fn();
  const auth: NativeAuthPort = {
    getSession: vi.fn(async () => current),
    signInWithPassword: vi.fn(async () => {
      current = session();
      authListener(current);
      return current;
    }),
    signOut: vi.fn(async () => {
      current = null;
      authListener(null);
    }),
    refreshSession: vi.fn(async () => {
      current = session(firstUser, "refreshed-token", 4_000);
      authListener(current);
      return current;
    }),
    onSessionChange(listener) {
      authListener = listener;
      return vi.fn();
    },
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn()
  };
  const lifecycle: AppLifecyclePort = {
    currentState: "active",
    addEventListener(_event, listener) {
      appListener = listener;
      return { remove: removeAppListener };
    }
  };
  return {
    auth,
    controller: createNativeSessionController(auth, lifecycle, clock),
    appState: (state: string) => appListener(state),
    removeAppListener,
    setSession: (value: NativeSession | null) => { current = value; authListener(value); }
  };
}

describe("native session lifecycle", () => {
  it("refreshes an expired restored session before exposing a signed-in identity", async () => {
    const { controller, auth } = setup(session(firstUser, "expired", 500));
    expect(await controller.restore()).toEqual({ status: "signed_in", userId: firstUser });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(await controller.getAccessToken()).toBe("refreshed-token");
    controller.dispose();
  });

  it("does not restore a session when refresh no longer returns an authenticated user", async () => {
    const { controller, auth } = setup(session(firstUser, "expired", 500));
    auth.refreshSession = vi.fn(async () => null);
    expect(await controller.restore()).toEqual({ status: "signed_out" });
    controller.dispose();
  });

  it("restores, signs in, and signs out without exposing credentials in UI state", async () => {
    const { controller, auth } = setup(null);
    expect(await controller.restore()).toEqual({ status: "signed_out" });
    expect(await controller.signInWithPassword(" user@example.test ", "password"))
      .toEqual({ status: "signed_in", userId: firstUser });
    expect(auth.signInWithPassword).toHaveBeenCalledWith("user@example.test", "password");
    expect(controller.getSnapshot()).toEqual({ status: "signed_in", userId: firstUser });
    expect(await controller.getAccessToken()).toBe("access-token");
    await controller.signOut();
    expect(controller.getSnapshot()).toEqual({ status: "signed_out" });
    expect(await controller.getAccessToken()).toBeNull();
    controller.dispose();
  });

  it("refreshes a near-expiry token once for concurrent protected requests", async () => {
    const { controller, auth } = setup(session(firstUser, "old-token", 1_050));
    const tokens = await Promise.all([controller.getAccessToken(), controller.getAccessToken()]);
    expect(tokens).toEqual(["refreshed-token", "refreshed-token"]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("rejects a refresh that changes the Auth UUID", async () => {
    const { controller, auth, setSession } = setup(session(firstUser, "old-token", 1_050));
    auth.refreshSession = vi.fn(async () => session(secondUser, "wrong-user-token", 4_000));
    await expect(controller.getAccessToken()).rejects.toEqual(new NativeAuthError("identity_changed"));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    setSession(null);
    expect(await controller.getAccessToken()).toBeNull();
    controller.dispose();
  });

  it("pauses refresh in the background and discards an in-flight refresh after sign-out", async () => {
    const { controller, auth, appState, removeAppListener } = setup(session(firstUser, "old-token", 1_050));
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    appState("background");
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    appState("active");
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);

    let finishRefresh!: (value: NativeSession | null) => void;
    auth.refreshSession = vi.fn(() => new Promise<NativeSession | null>((resolve) => { finishRefresh = resolve; }));
    const token = controller.getAccessToken();
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
    await controller.signOut();
    finishRefresh(session(firstUser, "stale-token", 4_000));
    expect(await token).toBeNull();
    controller.dispose();
    expect(removeAppListener).toHaveBeenCalledTimes(1);
  });

  it("discards late SDK session events after local sign-out", async () => {
    const { controller, setSession } = setup(session());
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.restore();
    await controller.signOut();
    setSession(session(firstUser, "late-token", 4_000));
    expect(await controller.restore()).toEqual({ status: "signed_out" });
    expect(await controller.getAccessToken()).toBeNull();
    expect(listener.mock.lastCall?.[0]).toEqual({ status: "signed_out" });
    controller.dispose();
  });

  it("keeps a new login's refresh independent from a refresh started before logout", async () => {
    const { controller, auth, setSession } = setup(session(firstUser, "old-token", 1_050));
    let finishOld!: (value: NativeSession) => void;
    let finishCurrent!: (value: NativeSession) => void;
    auth.refreshSession = vi.fn()
      .mockImplementationOnce(() => new Promise<NativeSession>(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise<NativeSession>(resolve => { finishCurrent = resolve; }));
    const oldRequest = controller.getAccessToken();
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
    await controller.signOut();
    await controller.signInWithPassword("customer@example.test", "password-fixture");
    setSession(session(firstUser, "new-login-token", 1_050));
    const currentRequest = controller.getAccessToken();
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(2));
    finishOld(session(secondUser, "stale-old-identity-token", 4_000));
    expect(await oldRequest).toBeNull();
    const concurrentCurrent = controller.getAccessToken();
    await Promise.resolve();
    expect(auth.refreshSession).toHaveBeenCalledTimes(2);
    finishCurrent(session(firstUser, "current-refreshed-token", 4_000));
    expect(await Promise.all([currentRequest, concurrentCurrent])).toEqual(["current-refreshed-token", "current-refreshed-token"]);
    expect(controller.getSnapshot()).toEqual({ status: "signed_in", userId: firstUser });
    controller.dispose();
  });

  it("blocks an automatic SDK refresh event that changes identity", async () => {
    const { controller, setSession } = setup(session());
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.restore();
    setSession(session(secondUser, "wrong-user-token", 4_000));
    expect(listener.mock.lastCall?.[0]).toEqual({ status: "signed_out" });
    await expect(controller.getAccessToken()).rejects.toEqual(new NativeAuthError("identity_changed"));
    await controller.signOut();
    expect(await controller.signInWithPassword("user@example.test", "password"))
      .toEqual({ status: "signed_in", userId: firstUser });
    controller.dispose();
  });
});

describe("customer signup and verified phone login", () => {
  const phone = "+959123456789";
  function phoneSession(): NativeSession {
    return { ...session(), user: { id: firstUser, phone: phone.slice(1), phone_confirmed_at: "2026-11-05T00:00:00Z" } };
  }
  function setupPhone() {
    const value = setup(null);
    value.auth.phoneOtpEnabled = vi.fn(async () => true);
    value.auth.requestPhoneOtp = vi.fn(async () => {});
    value.auth.verifyPhoneOtp = vi.fn(async () => phoneSession());
    return value;
  }

  it("creates an email account and immediately exposes an authenticated signup for onboarding", async () => {
    const { auth, controller } = setup(null);
    auth.signUpWithPassword = vi.fn(async () => session());
    expect(await controller.signUpWithPassword(" user@example.test ", "long-password")).toEqual({ authenticated: true });
    expect(auth.signUpWithPassword).toHaveBeenCalledWith("user@example.test", "long-password");
    controller.dispose();
  });

  it("keeps signup signed out when email confirmation is required and rejects invalid input", async () => {
    const { auth, controller } = setup(null);
    auth.signUpWithPassword = vi.fn(async () => null);
    await expect(controller.signUpWithPassword("bad-email", "long-password")).rejects.toBeInstanceOf(NativeAuthError);
    await expect(controller.signUpWithPassword("user@example.test", "short")).rejects.toBeInstanceOf(NativeAuthError);
    expect(auth.signUpWithPassword).not.toHaveBeenCalled();
    expect(await controller.signUpWithPassword("user@example.test", "long-password")).toEqual({ authenticated: false });
    expect(await controller.restore()).toEqual({ status: "signed_out" });
    controller.dispose();
  });

  it("does not call SMS methods unless the live provider gate is enabled", async () => {
    const { auth, controller } = setupPhone();
    auth.phoneOtpEnabled = vi.fn(async () => false);
    expect(await controller.phoneOtpEnabled()).toBe(false);
    await expect(controller.requestPhoneOtp(phone)).rejects.toThrow("unavailable");
    await expect(controller.verifyPhoneOtp(phone, "123456")).rejects.toThrow("unavailable");
    expect(auth.requestPhoneOtp).not.toHaveBeenCalled();
    expect(auth.verifyPhoneOtp).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("requires a requested E.164 phone and verifies a confirmed provider identity", async () => {
    const { auth, controller } = setupPhone();
    await expect(controller.requestPhoneOtp("09123456789")).rejects.toBeInstanceOf(NativeAuthError);
    await expect(controller.verifyPhoneOtp(phone, "123456")).rejects.toBeInstanceOf(NativeAuthError);
    await controller.requestPhoneOtp(phone);
    await expect(controller.verifyPhoneOtp("+959999999999", "123456")).rejects.toBeInstanceOf(NativeAuthError);
    expect(auth.verifyPhoneOtp).not.toHaveBeenCalled();
    expect(await controller.verifyPhoneOtp(phone, "123456")).toEqual({ status: "signed_in", userId: firstUser });
    controller.dispose();
  });

  it("rejects unconfirmed or mismatched phones and clears the SDK session", async () => {
    for (const user of [{ id: firstUser, phone: phone.slice(1) }, { id: firstUser, phone: "959999999999", phone_confirmed_at: "2026-11-05" }]) {
      const { auth, controller, setSession } = setupPhone();
      auth.verifyPhoneOtp = vi.fn(async () => ({ ...session(), user }));
      await controller.requestPhoneOtp(phone);
      await expect(controller.verifyPhoneOtp(phone, "123456")).rejects.toBeInstanceOf(NativeAuthError);
      expect(auth.signOut).toHaveBeenCalledTimes(1);
      setSession(phoneSession());
      expect(await controller.restore()).toEqual({ status: "signed_out" });
      expect(await controller.getAccessToken()).toBeNull();
      controller.dispose();
    }
  });

  it("rechecks provider readiness after verification and clears a session if it was disabled", async () => {
    const { auth, controller } = setupPhone();
    auth.verifyPhoneOtp = vi.fn(async () => {
      auth.phoneOtpEnabled = vi.fn(async () => false);
      return phoneSession();
    });
    await controller.requestPhoneOtp(phone);
    await expect(controller.verifyPhoneOtp(phone, "123456")).rejects.toBeInstanceOf(NativeAuthError);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not resurrect a phone session when logout occurs during the final provider check", async () => {
    const { auth, controller } = setupPhone();
    let completeCheck!: (enabled: boolean) => void;
    let checks = 0;
    auth.phoneOtpEnabled = vi.fn(async () => {
      checks++;
      if (checks === 3) return new Promise<boolean>(resolve => { completeCheck = resolve; });
      return true;
    });
    await controller.requestPhoneOtp(phone);
    const verifying = controller.verifyPhoneOtp(phone, "123456");
    await vi.waitFor(() => expect(completeCheck).toBeTypeOf("function"));
    await controller.signOut();
    completeCheck(true);
    expect(await verifying).toEqual({ status: "signed_out" });
    expect(controller.getSnapshot()).toEqual({ status: "signed_out" });
    expect(await controller.getAccessToken()).toBeNull();
    controller.dispose();
  });

  it("rate limits SMS requests, expires stale challenges and prevents phone linking while signed in", async () => {
    let now = 1_000_000;
    const { auth } = setupPhone();
    const controller = createNativeSessionController(auth, { currentState: "active", addEventListener: () => ({ remove() {} }) }, () => now);
    await controller.requestPhoneOtp(phone);
    await expect(controller.requestPhoneOtp(phone)).rejects.toThrow("one minute");
    now += 601_000;
    await expect(controller.verifyPhoneOtp(phone, "123456")).rejects.toBeInstanceOf(NativeAuthError);
    await controller.requestPhoneOtp(phone);
    await controller.verifyPhoneOtp(phone, "123456");
    await expect(controller.requestPhoneOtp(phone)).rejects.toThrow("unavailable");
    controller.dispose();
  });
});
